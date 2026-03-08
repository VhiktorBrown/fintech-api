import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccountLookupDto } from './dto';
import { AppResponse } from 'src/shared/app-response';

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
            AppResponse.error("Account details not found", HttpStatus.NOT_FOUND);
        }

        return AppResponse.success("Account found", {
            account: {
                name: `${account.user.firstName} ${account.user.lastName}`,
                accountNumber: account.accountNumber
            }
        });
    }

    //fetches all users accounts
    async getAccounts(
        userId: number
    ) {
        //First get the account
        const accounts = await this.prisma.account.findMany({
            where: {userId: userId }
        });

        return AppResponse.success("Accounts retrieved", { accounts });
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
            AppResponse.error('Account details not found', HttpStatus.NOT_FOUND);
        }

        return AppResponse.success("Account retrieved successfully", { account });
    }
}
