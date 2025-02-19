import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccountLookupDto } from './dto';

@Injectable()
export class AccountService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ){}

    //fetch account details with account number
    async accountLookUp(
        userId: number,
        dto: AccountLookupDto
    ){
        //check if the account number exists
        const account = await this.prisma.account.findUnique({
            where: { accountNumber: dto.accountNumber },
            include: { user: true }
        });

        if(!account){
            return new ForbiddenException(
                "Account details not found"
            );
        }

        return {
            success: true,
            message: "Account found",
            account: {
                name: `${account.user.firstName} ${account.user.lastName}`,
                accountNumber: account.accountNumber
            }
        }
    }

    //fetches all users accounts
    async getAccounts(
        userId: number
    ) {
        //First get the account
        const accounts = await this.prisma.account.findMany({
            where: {userId: userId }
        });

        return {
            success: true,
            message: "Accounts retrieved",
            accounts: accounts
        }
    }

    //fetching user's account details - returns only authenticated user's account details
    async getAccountDetails(
        userId: number,
        accountId: number,
    ) {

        //Next, check for account mapping user's ID
        const account = await this.prisma.account.findUnique({
            where: { id: accountId, userId: userId }
        });

        if(!account){
            throw new ForbiddenException(
                'Account details not found'
            );
        }

        console.log((await account).balance);
        return {
            success: true,
            message: "Account retrieved successfully",
            account: {
                ...account
            }
        }
    }
}
