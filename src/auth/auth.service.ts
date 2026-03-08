import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { AppResponse } from "src/shared/app-response";
import { SignInDto } from "./dto/sign-in.dto";
import { RegisterDto } from "./dto";
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

        //destructure to strip sensitive fields before signing tokens
        const { password, bvn, pin, refreshToken, ...safeUser } = user;
        return this.signTokens(safeUser);
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

            const { password, ...safeUser } = user;
            return this.signTokens(safeUser);
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

    //uses the refresh token to issue a new access token without requiring re-login.
    //no userId parameter — we decode it from the refresh token itself so this
    //endpoint does not need a JWT guard and works even after the access token expires
    async refreshAccessToken(refreshToken: string){
        const secret = this.config.get('JWT_SECRET');

        //decode and verify the refresh token to extract the userId from its payload.
        //if the token is invalid or tampered with, jwt.verify throws and we return 401
        let payload: { sub: number; email: string };
        try {
            payload = await this.jwt.verifyAsync(refreshToken, { secret });
        } catch {
            AppResponse.error('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
        }

        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub }
        });

        //if the user has no refresh token stored, they have logged out
        if(!user || !user.refreshToken){
            AppResponse.error('Access denied', HttpStatus.UNAUTHORIZED);
        }

        //verify the incoming token against the stored hash to ensure it has
        //not been replaced by a newer login/refresh cycle
        const tokenMatches = await argon.verify(user.refreshToken, refreshToken);
        if(!tokenMatches){
            AppResponse.error('Access denied', HttpStatus.UNAUTHORIZED);
        }

        //issue a fresh access token only — the refresh token stays the same
        const newPayload = { sub: user.id, email: user.email };
        const accessToken = await this.jwt.signAsync(newPayload, {
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
    async signTokens(user: { id: number; email: string }){
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
