import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { SignInDto } from "./dto/sign-in.dto";
import { BvnDto, NinDto, PersonalInfoDto, RegisterDto, TransactionPinDto } from "./dto";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

@Injectable({})
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private config: ConfigService,
    ){

    }
    //validates credentials and logs in user if correct
    async login(dto: SignInDto){
        //First, attempt to find user in database.
        const user = await this.prisma.user.findUnique({
            where: {
                email: dto.email
            }
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
    async setPersonalInfo(dto: PersonalInfoDto){

    }

    //sets user's BVN
    async setBvn(dto: BvnDto){

    }

    //sets user's NIN
    async setNin(dto: NinDto){

    }

    //sets user's Transaction Pin
    async setTransactionPin(dto: TransactionPinDto){

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