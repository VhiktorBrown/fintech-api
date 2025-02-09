import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(
    Strategy,
    'jwt' // specifies the guard type too use. Could be any other type/kind
) {
    constructor(
        private config: ConfigService,
        private prisma: PrismaService) {
            super({
                jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
                secretOrKey: config.get('JWT_SECRET')
            })
        }

        async validate(payload: any) {
            //Firstly, get the id
            const userId = payload.sub;

            //Next, we need to check if this ID exists in our database
            const user = await this.prisma.user.findUnique({
                where: {
                    id: userId,
                }
            });

            //remove the hashed password
            delete user.password;

            //return user
            return user;
        }
}