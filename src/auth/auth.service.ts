import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { AppResponse } from "src/shared/app-response";
import { SignInDto } from "./dto/sign-in.dto";
import { BvnDto, NinDto, PersonalInfoDto, RegisterDto, TransactionPinDto } from "./dto";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon from 'argon2';
import { randomInt } from 'crypto';
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AccountType, TransactionStatus, TransactionType } from "@prisma/client";
import { generateTransactionReference } from "src/shared/functions";
import { encrypt } from "src/shared/encryption";

@Injectable({})
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private config: ConfigService,
    ){}

    //validates credentials and signs in the user if they are correct
    async login(dto: SignInDto){
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email }
        });

        //use a generic message so we don't reveal whether the email exists
        if(!user){
            AppResponse.error('Invalid login credentials', HttpStatus.UNAUTHORIZED);
        }

        const pwMatches = await argon.verify(user.password, dto.password);
        if(!pwMatches){
            AppResponse.error('Invalid login credentials', HttpStatus.UNAUTHORIZED);
        }

        //strip sensitive fields before returning the user object
        delete user.password;
        delete user.bvn;
        delete user.pin;
        delete user.refreshToken;

        return this.signTokens(user);
    }

    //creates a new user account and returns tokens immediately
    async register(dto: RegisterDto){
        const hash = await argon.hash(dto.password);

        try {
            const user = await this.prisma.user.create({
                data: {
                    email: dto.email,
                    password: hash,
                }
            });

            delete user.password;
            return this.signTokens(user);
        }catch(error){
            if(error instanceof PrismaClientKnownRequestError) {
                if(error.code == 'P2002'){
                    AppResponse.error('Account already exists', HttpStatus.CONFLICT);
                }
            }
            throw error;
        }
    }

    //promotes an existing user to admin using the ADMIN_SECRET from the environment.
    //kept separate from register so the admin secret is never part of the
    //standard sign-up flow, reducing the risk of accidental exposure
    async promoteToAdmin(userId: number, adminSecret: string){
        const expectedSecret = this.config.get<string>('ADMIN_SECRET');

        if(!adminSecret || adminSecret !== expectedSecret){
            AppResponse.error('Invalid admin secret', HttpStatus.FORBIDDEN);
        }

        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if(user.isAdmin){
            AppResponse.error('User is already an admin', HttpStatus.CONFLICT);
        }

        await this.prisma.user.update({
            where: { id: userId },
            data: { isAdmin: true }
        });

        return AppResponse.success('User promoted to admin successfully');
    }

    //updates the user's profile information
    async setPersonalInfo(userId: number, dto: PersonalInfoDto){
        try {
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

            delete user.password;
            delete user.bvn;
            delete user.pin;
            delete user.refreshToken;

            return AppResponse.success("Personal Info updated successfully", { user });
        }catch(error){
            AppResponse.error('Failed to update personal info', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    //saves the user's BVN and marks it as verified.
    //the BVN is encrypted at rest — it is sensitive PII and should never be
    //stored as plain text in case the database is ever compromised
    async setBvn(userId: number, dto: BvnDto){
        if (dto.bvn.length !== 11) {
            AppResponse.error("BVN must be exactly 11 characters", HttpStatus.BAD_REQUEST);
        }
        try {
            const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
            const encryptedBvn = encrypt(dto.bvn, encryptionKey);

            await this.prisma.user.update({
                where: { id: userId },
                //set bvnVerified to true so downstream checks can trust this field
                data: { bvn: encryptedBvn, bvnVerified: true }
            });

            return AppResponse.success("BVN successfully set");
        } catch (error) {
            AppResponse.error("An unexpected error occurred. Please try again.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    //saves the user's NIN and marks it as verified.
    //encrypted for the same reason as BVN — it is a national identity number
    async setNin(userId: number, dto: NinDto){
        try {
            const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
            const encryptedNin = encrypt(dto.nin, encryptionKey);

            await this.prisma.user.update({
                where: { id: userId },
                //set ninVerified to true so downstream checks can trust this field
                data: { nin: encryptedNin, ninVerified: true }
            });
            return AppResponse.success("NIN successfully set");
        } catch(error){
            AppResponse.error("Failed to update NIN", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    //sets the transaction PIN and creates a bank account if the user doesn't have one yet
    async setTransactionPin(userId: number, dto: TransactionPinDto){
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            AppResponse.error('User does not exist', HttpStatus.NOT_FOUND);
        }

        if (user.pin !== null) {
            AppResponse.error('Transaction PIN is already set.', HttpStatus.CONFLICT);
        }

        if (dto.pin !== dto.confirmPin) {
            AppResponse.error("Pins don't match", HttpStatus.BAD_REQUEST);
        }

        const hashedPin = await argon.hash(dto.pin.toString());

        await this.prisma.user.update({
            where: { id: userId },
            data: { pin: hashedPin }
        });

        //check if the user already has an account before creating one
        const existingAccount = await this.prisma.account.findFirst({
            where: { userId: userId },
        });

        if(!existingAccount){
            //use crypto.randomInt instead of Math.random() because Math.random()
            //is not cryptographically secure and can produce predictable sequences
            const accountNumber = randomInt(1_000_000_000, 9_999_999_999).toString();

            const account = await this.prisma.account.create({
                data: {
                    accountNumber: accountNumber,
                    userId: user.id,
                    accountType: AccountType.SAVINGS,
                    balance: user.isAdmin ? 500000 : 0.0,
                    canDebit: true,
                    canCredit: true,
                    isActive: true,
                    lastTransactionDate: new Date(),
                }
            });

            //record the initial credit as a transaction so the admin balance
            //is fully traceable from day one
            if(user.isAdmin){
                await this.prisma.transaction.create({
                    data: {
                        type: TransactionType.CREDIT,
                        amount: 500000,
                        reference: generateTransactionReference(),
                        status: TransactionStatus.SUCCESS,
                        balancebefore: 0,
                        balanceAfter: 500000,
                        accountId: account.id,
                        counterpartyAccountId: account.id,
                        description: 'Initial funding of Admin account upon creation',
                    }
                });
            }
            return AppResponse.success("Transaction PIN set successfully, and account created.");
        } else {
            return AppResponse.success("Transaction PIN set successfully");
        }
    }

    //uses the refresh token to issue a new access token without requiring re-login
    async refreshAccessToken(userId: number, refreshToken: string){
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        });

        //if the user has no refresh token stored, they are logged out
        if(!user || !user.refreshToken){
            AppResponse.error('Access denied', HttpStatus.UNAUTHORIZED);
        }

        //verify the incoming token against the stored hash
        const tokenMatches = await argon.verify(user.refreshToken, refreshToken);
        if(!tokenMatches){
            AppResponse.error('Access denied', HttpStatus.UNAUTHORIZED);
        }

        //issue a fresh access token only — the refresh token stays the same
        const payload = { sub: user.id, email: user.email };
        const secret = this.config.get('JWT_SECRET');
        const accessToken = await this.jwt.signAsync(payload, {
            expiresIn: '15m',
            secret,
        });

        return AppResponse.success('Token refreshed', { access_token: accessToken });
    }

    //clears the stored refresh token, effectively logging the user out
    async logout(userId: number){
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null }
        });

        return AppResponse.success('Logged out successfully');
    }

    //generates both an access token (short-lived) and a refresh token (long-lived).
    //the refresh token is hashed before being stored — we never persist raw tokens
    async signTokens(user: any){
        const payload = { sub: user.id, email: user.email };
        const secret = this.config.get('JWT_SECRET');

        const [accessToken, refreshToken] = await Promise.all([
            this.jwt.signAsync(payload, { expiresIn: '15m', secret }),
            this.jwt.signAsync(payload, { expiresIn: '7d',  secret }),
        ]);

        //hash and store the refresh token so even a DB leak doesn't expose it
        const hashedRefreshToken = await argon.hash(refreshToken);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: hashedRefreshToken }
        });

        return AppResponse.success('Success', {
            user,
            access_token: accessToken,
            refresh_token: refreshToken,
        });
    }
}
