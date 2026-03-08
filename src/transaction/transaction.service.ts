import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { FundUserAccountDto } from './dto/fund-user-account.dto';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { generateTransactionReference } from 'src/shared/functions';
import { AppResponse } from 'src/shared/app-response';
import * as argon from 'argon2';

@Injectable()
export class TransactionService {
    constructor(
        private prisma: PrismaService,
    ){}

    async fundUserAccountByAdmin(
        userId: number,
        dto: FundUserAccountDto
    ) {
        return this.prisma.$transaction(async (tx) => {
            //first, confirm that the requesting user is an admin
            const user = await tx.user.findUnique({
                where: {id: userId}
            });

            if(!user.isAdmin){
                AppResponse.error('You cannot perform this operation', HttpStatus.FORBIDDEN);
            }
            /*
                For testing purposes, there's only going to be one admin account.
                So, that we will use that for funding user accounts.
            */

            //verify the transaction pin against the stored hash
            const pinMatches = await argon.verify(
                user.pin,
                dto.transactionPin.toString()
            );
            if(!pinMatches){
                AppResponse.error("Invalid transaction pin", HttpStatus.FORBIDDEN);
            }

            //fetch admin's account
            const account = await tx.account.findFirst({
                where: { userId: userId }
            });

            //fetch recipient's account by account number
            const recipientAccount = await tx.account.findUnique({
                where: { accountNumber: dto.accountNumber}
            });

            if(!recipientAccount){
                AppResponse.error("Account does not exist", HttpStatus.NOT_FOUND);
            }

            //an admin should not be able to fund their own account through this endpoint
            if(account.accountNumber === recipientAccount.accountNumber){
                AppResponse.error("Sorry, you cannot fund yourself.", HttpStatus.FORBIDDEN);
            }

            //ensure the admin account has enough balance to cover the transfer
            if(dto.amount > Number(account.balance)){
                AppResponse.error('Insufficient account balance', HttpStatus.FORBIDDEN);
            }

            const reference = generateTransactionReference();

            //record the debit leg of the transaction for the admin's account
            const debitTransaction = await tx.transaction.create({
                data: {
                    type: TransactionType.DEBIT,
                    amount: dto.amount,
                    reference: reference,
                    status: TransactionStatus.PENDING,
                    description: 'Admin funding',
                    accountId: account.id,
                    balancebefore: Number(account.balance),
                    balanceAfter: Number(account.balance) - dto.amount,
                    counterpartyAccountId: recipientAccount.id,
                }
            });

            //record the credit leg of the transaction for the recipient's account
            const creditTransaction = await tx.transaction.create({
                data: {
                    type: TransactionType.CREDIT,
                    amount: dto.amount,
                    reference: reference,
                    status: TransactionStatus.PENDING,
                    description: 'Admin funding',
                    accountId: recipientAccount.id,
                    balancebefore: Number(recipientAccount.balance),
                    balanceAfter: Number(recipientAccount.balance) + dto.amount,
                    counterpartyAccountId: account.id,
                }
            });

            //deduct from the admin's balance
            await tx.account.update({
                where: {id: account.id},
                data: {
                    balance : { decrement: dto.amount},
                    lastTransactionDate: new Date(),
                }
            });

            //credit the recipient's balance
            await tx.account.update({
                where: { id: recipientAccount.id },
                data: {
                    balance: {increment: dto.amount},
                    lastTransactionDate: new Date(),
                }
            });

            //mark both legs of the transaction as successful
            await tx.transaction.update({
                where: { id: debitTransaction.id},
                data: { status: TransactionStatus.SUCCESS }
            });

            await tx.transaction.update({
                where: { id: creditTransaction.id},
                data: { status: TransactionStatus.SUCCESS }
            });

            return AppResponse.success("Admin funding successful");
        });
    }

    async sendMoney(
        userId: number,
        dto: FundUserAccountDto){
            return this.prisma.$transaction(async (tx) => {

                const user = await tx.user.findUnique({
                    where: {id: userId}
                });

                //user.pin holds an argon2 hash, so we must use argon.verify
                //to compare it against the raw pin value from the request.
                //a direct string comparison would never match
                const pinMatches = await argon.verify(
                    user.pin,
                    dto.transactionPin.toString()
                );
                if(!pinMatches){
                    AppResponse.error("Invalid transaction pin", HttpStatus.FORBIDDEN);
                }

                //fetch the sender's account
                const account = await tx.account.findFirst({
                    where: { userId: userId },
                    include: { user: true }
                });

                //fetch the recipient's account by account number
                const recipientAccount = await tx.account.findUnique({
                    where: { accountNumber: dto.accountNumber},
                    include: { user: true }
                });

                if(!recipientAccount){
                    AppResponse.error('Account details not found', HttpStatus.NOT_FOUND);
                }

                //ensure the sender has enough balance to cover the transfer
                if(dto.amount > Number(account.balance)){
                    AppResponse.error('Insufficient account balance', HttpStatus.FORBIDDEN);
                }

                //a user should not be able to send money to their own account
                if(account.accountNumber == recipientAccount.accountNumber){
                    AppResponse.error("Sorry, you cannot send money to yourself", HttpStatus.FORBIDDEN);
                }

                const reference = generateTransactionReference();

                //record the debit leg for the sender
                const debitTransaction = await tx.transaction.create({
                    data: {
                        type: TransactionType.DEBIT,
                        amount: dto.amount,
                        reference: reference,
                        status: TransactionStatus.PENDING,
                        description: dto.description
                        ?? `Transfer to ${recipientAccount.user.firstName} ${recipientAccount.accountNumber}`,
                        accountId: account.id,
                        balancebefore: Number(account.balance),
                        balanceAfter: Number(account.balance) - dto.amount,
                        counterpartyAccountId: recipientAccount.id,
                    }
                });

                //record the credit leg for the recipient
                const creditTransaction = await tx.transaction.create({
                    data: {
                        type: TransactionType.CREDIT,
                        amount: dto.amount,
                        reference: reference,
                        status: TransactionStatus.PENDING,
                        description: dto.description ??
                         `Transfer from ${account.user.firstName} ${account.accountNumber}`,
                        accountId: recipientAccount.id,
                        balancebefore: Number(recipientAccount.balance),
                        balanceAfter: Number(recipientAccount.balance) + dto.amount,
                        counterpartyAccountId: account.id,
                    }
                });

                //deduct from sender's balance
                await tx.account.update({
                    where: {id: account.id},
                    data: {
                        balance : { decrement: dto.amount},
                        lastTransactionDate: new Date(),
                    }
                });

                //credit the recipient's balance
                await tx.account.update({
                    where: { id: recipientAccount.id },
                    data: {
                        balance: {increment: dto.amount},
                        lastTransactionDate: new Date(),
                    }
                });

                //mark both legs of the transaction as successful
                await tx.transaction.update({
                    where: { id: debitTransaction.id},
                    data: { status: TransactionStatus.SUCCESS }
                });

                await tx.transaction.update({
                    where: { id: creditTransaction.id},
                    data: { status: TransactionStatus.SUCCESS }
                });

                return AppResponse.success("Transfer successful");
            })
        }

        //fetches all transactions belonging to a specific account
        async getAllTransactions(
            userId: number ,
            accountId: number
        ) {
            //verify the account exists and belongs to the requesting user
            const account = await this.prisma.account.findUnique({
                where: { id: accountId, userId: userId }
            });

            if(!account){
                AppResponse.error("Account does not exist", HttpStatus.NOT_FOUND);
            }

            const transactions = await this.prisma.transaction.findMany({
                where: { accountId: account.id },
                select: {
                    id: true,
                    amount: true,
                    reference: true,
                    status: true,
                    description: true,
                    type: true,
                    balancebefore: true,
                    balanceAfter: true,
                    createdAt: true,
                    counterpartyAccount: {
                      select: {
                        accountNumber: true,
                        user: {
                          select: {
                            firstName: true,
                            lastName: true
                          }
                        }
                      }
                    }
                  },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            return AppResponse.success("Transactions retrieved successfully", { transactions });
        }

        //fetches a single transaction by ID, scoped to the requesting user's accounts
        async getTransaction(userId: number, transactionId: number) {
            const transaction = await this.prisma.transaction.findFirst({
                where: {
                    id: transactionId,
                    OR: [
                        {
                            account: {
                                userId: userId
                            }
                        }
                    ]
                },
                select: {
                    id: true,
                    amount: true,
                    reference: true,
                    status: true,
                    description: true,
                    type: true,
                    balancebefore: true,
                    balanceAfter: true,
                    createdAt: true,
                    counterpartyAccount: {
                        select: {
                            accountNumber: true,
                            user: {
                                select: {
                                    firstName: true,
                                    lastName: true,
                                }
                            }
                        }
                    }
                }
            });

            if(!transaction){
                AppResponse.error("Transaction not found", HttpStatus.NOT_FOUND);
            }

            return AppResponse.success("Transaction found", { transaction });
        }
}
