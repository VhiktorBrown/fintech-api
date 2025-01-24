import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable({})
export class AuthService {
    constructor(private prismaService: PrismaService){

    }
    async login(){
        return 'Logged into Fintech API';
    }

    async register(){
        return 'Registered on Fintech API successfully';
    }
}