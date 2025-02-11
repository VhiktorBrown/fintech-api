import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { SignInDto } from "./dto/sign-in.dto";
import { BvnDto, NinDto, PersonalInfoDto, RegisterDto, TransactionPinDto } from "./dto";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AccountType, TransactionStatus, TransactionType } from "@prisma/client";
import { generateTransactionReference } from "src/shared/functions";

@Injectable({})
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private config: ConfigService,
    ){}

    //validates credentials and logs in user if correct
    async login(dto: SignInDto){
        //First, attempt to find user in database.
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email }
        });
        //If user does not exist, throw appropriate error
        if(!user){
            throw new ForbiddenException(
                'Invalid login credentials'
            );
        }

        //If code execution reaches here, it means it found user
        //So compare passwords
        const pwMatches = await argon.verify(
            user.password,
            dto.password
        );

        //If incorrect, throw appropriate error
        if(!pwMatches){
            throw new ForbiddenException(
                'Invalid login credentials'
            );
        }

        //remove the password hash
        delete user.password;
        delete user.bvn;
        delete user.pin;

        //If execution reaches here, it means that passwords matched
        //So, send back an auth token after signing
        return this.signToken(user);
    }

    //registers user
    async register(dto: RegisterDto){
        //first hash the user's password
        const hash = await argon.hash(dto.password);

        try {
            //first, save the user in the database
            const user = await this.prisma.user.create({
                data: {
                    email: dto.email,
                    password: hash,
                    isAdmin: dto.adminSecret != null && dto.adminSecret 
                    === this.config.get('ADMIN_SECRET') ? true : false
                }
            });

            //remove the password hash
            delete user.password;

            //then, generate a signed token and return that with the user details
            return this.signToken(user);
        }catch(error){
            if(error
                instanceof
                PrismaClientKnownRequestError) {
                    if(error.code == 'P2002'){
                        throw new ForbiddenException(
                            'Account already exists'
                        );
                    }
            }
            throw error;
        }
    }

    //sets personal info of user like first name, last name, etc.
    async setPersonalInfo(
        userId: number,
        dto: PersonalInfoDto){

        try {
            //update user's personal Info in database.
            const user = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    phoneNumber: dto.phoneNumber,
                    address: dto.address,
                    dateOfBirth: dto.dateOfBirth,
                }
            });

            //remove user's password, bvn and pin
            delete user.password;
            delete user.bvn;
            delete user.pin;

            return {
                success: true,
                message: "Personal Info updated successfully",
                user: {
                    ...user
                }
            }
        }catch(error){
            throw new ForbiddenException();
        }
        
    }

    //sets user's BVN
    async setBvn(
        userId: number,
        dto: BvnDto){
            // Validate BVN length
            if (dto.bvn.length !== 11) {
                throw new BadRequestException("BVN must be exactly 11 characters");
            }
            try {
                // Update user's BVN if valid
                await this.prisma.user.update({
                    where: { id: userId },
                    data: { bvn: dto.bvn }
                });
        
                return {
                    success: true,
                    message: "BVN successfully set",
                };
            } catch (error) {
            // Handle database errors or unexpected issues
            throw new InternalServerErrorException(
                "An unexpected error occurred. Please try again.");
                }
    }

    //sets user's NIN
    async setNin(
        userId: number,
        dto: NinDto){
            try {
                //attempt to update only user's NIN
                const user = await this.prisma.user.update({
                    where: { id: userId },
                    data: { nin: dto.nin }
                });
                return {
                    success: true,
                    message: "NIN successfully set"
                }
            } catch(error){
                throw new ForbiddenException();
            }
    }

    //sets user's Transaction Pin and create an account if none exists
    async setTransactionPin(
        userId: number,
        dto: TransactionPinDto){
        // Find the user in the database
        const user = await this.prisma.user.findUnique({
            where: { id: userId }, 
        });

        // If the user does not exist, throw an error
        if (!user) {
            throw new ForbiddenException('User does not exist');
        }

        // Check if the transaction PIN is already set
        if (user.pin !== null) {
            throw new ConflictException('Transaction PIN is already set.');
        }

        // Confirm that both pins match
        if (dto.pin !== dto.confirmPin) {
            throw new ForbiddenException("Pins don't match");
        }

        // Update the user with the new transaction PIN
        await this.prisma.user.update({
            where: { id: userId },
            data: { pin: dto.pin.toString() }
        });

        //check if user already has a bank account
        const account = await this.prisma.account.findFirst({
            where: { userId: userId},
        });

        if(!account){
            // Generate a unique account number (e.g., random 10-digit number)
            const accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();

            // Create the account for the user
            const account = await this.prisma.account.create({
                data: {
                    accountNumber: accountNumber,
                    userId: user.id,
                    accountType: AccountType.SAVINGS,
                    balance: user.isAdmin ? 500000 : 0.0,
                    canDebit: true,
                    canCredit: true,
                    isActive: true
                }
            });

            //create a transaction if user is an admin so that we keep track
            //of the amount funded
            if(user.isAdmin){
                await this.prisma.transaction.create({
                    data: {
                        type: TransactionType.CREDIT,
                        amount: 500000,
                        reference: generateTransactionReference(),
                        status: TransactionStatus.SUCCESS,
                        senderAccountId: account.id,
                        recipientAccountId: account.id,
                        description: 'Initial funding of Admin account upon creation',
                    }
                });
            }
            return {
                success: true,
                message: "Transaction PIN set successfully, and account created."
            };
        }else {
            return {
                success: true,
                message: "Transaction PIN set successfully"
            }
        }
    }

    //This is to generate a JWT token.
    async signToken(user: any) : Promise<{}>{
        //create the payload that we want to sign
        const payload = {
            sub: user.id,
            email: user.email
        };
        //fetch our secret from our ENV file
        const secret = this.config.get('JWT_SECRET');
        //Next, sign the payload and generate the token
        const token = await this.jwt.signAsync(payload, {
            expiresIn: '30m',
            secret: secret,
        });

        //return both the access token and the user's details
        return {
            user: {
                ...user
            },
            "access_token": token
        };

    }
}