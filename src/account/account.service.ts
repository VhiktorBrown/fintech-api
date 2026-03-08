import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { AccountType, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccountLookupDto } from './dto';
import { AppResponse } from 'src/shared/app-response';
import { generateTransactionReference } from 'src/shared/functions';

@Injectable()
export class AccountService {
    constructor(private prisma: PrismaService){}

    //fetch account details with account number
    async accountLookUp(userId: number, dto: AccountLookupDto){
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

    //fetches all accounts belonging to the authenticated user
    async getAccounts(userId: number) {
        const accounts = await this.prisma.account.findMany({
            where: { userId: userId }
        });

        return AppResponse.success("Accounts retrieved", { accounts });
    }

    //fetches a single account, scoped to the authenticated user
    async getAccountDetails(userId: number, accountId: number) {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId, userId: userId }
        });

        if(!account){
            AppResponse.error('Account details not found', HttpStatus.NOT_FOUND);
        }

        return AppResponse.success("Account retrieved successfully", { account });
    }

    //deactivates an account by setting isActive to false.
    //the account remains in the database but can no longer send or receive money
    async deactivateAccount(userId: number, accountId: number){
        const account = await this.prisma.account.findUnique({
            where: { id: accountId, userId: userId }
        });

        if(!account){
            AppResponse.error('Account not found', HttpStatus.NOT_FOUND);
        }

        if(!account.isActive){
            AppResponse.error('Account is already deactivated', HttpStatus.CONFLICT);
        }

        await this.prisma.account.update({
            where: { id: accountId },
            data: { isActive: false }
        });

        return AppResponse.success('Account deactivated successfully');
    }

    //creates a bank account for a user after they set their transaction PIN.
    //if the user is an admin, the account is seeded with an initial balance
    //and that credit is recorded as a transaction for traceability
    async createAccountForUser(userId: number, isAdmin: boolean){
        //check if the user already has an account to avoid duplicates
        const existingAccount = await this.prisma.account.findFirst({
            where: { userId }
        });

        if(existingAccount){
            return;
        }

        //crypto.randomInt is cryptographically secure unlike Math.random()
        const accountNumber = randomInt(1_000_000_000, 9_999_999_999).toString();

        const account = await this.prisma.account.create({
            data: {
                accountNumber,
                userId,
                accountType: AccountType.SAVINGS,
                balance: isAdmin ? 500000 : 0.0,
                canDebit: true,
                canCredit: true,
                isActive: true,
                lastTransactionDate: new Date(),
            }
        });

        //record the initial admin credit as a transaction so the balance
        //is fully traceable from the moment the account is created
        if(isAdmin){
            await this.prisma.transaction.create({
                data: {
                    type: TransactionType.CREDIT,
                    amount: 500000,
                    reference: generateTransactionReference(),
                    status: TransactionStatus.SUCCESS,
                    balanceBefore: 0,
                    balanceAfter: 500000,
                    accountId: account.id,
                    counterpartyAccountId: account.id,
                    description: 'Initial funding of Admin account upon creation',
                }
            });
        }
    }
}
