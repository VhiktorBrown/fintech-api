import { Injectable } from "@nestjs/common";

@Injectable({})
export class AuthService {
    async login(){
        return 'Logged into Fintech API';
    }

    async register(){
        return 'Registered on Fintech API successfully';
    }
}