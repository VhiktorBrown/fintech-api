import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminFundDto } from './dto/admin-fund.dto';
import { SendMoneyDto } from './dto/send-money.dto';
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
        dto: AdminFundDto
    ) {
        return this.prisma.$transaction(async (tx) => {
            //confirm that the requesting user is an admin
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
                    balanceBefore: Number(account.balance),
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
                    balanceBefore: Number(recipientAccount.balance),
                    balanceAfter: Number(recipientAccount.balance) + dto.amount,
                    counterpartyAccountId: account.id,
                }
            });

            //deduct from the admin's balance
            await tx.account.update({
                where: {id: account.id},
                data: {
                    balance: { decrement: dto.amount},
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
        dto: SendMoneyDto){
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

                //reject transfers to or from deactivated accounts
                if(!account.isActive){
                    AppResponse.error('Your account is deactivated and cannot send money', HttpStatus.FORBIDDEN);
                }

                if(!recipientAccount.isActive){
                    AppResponse.error('The recipient account is deactivated', HttpStatus.FORBIDDEN);
                }

                //a user should not be able to send money to their own account
                if(account.accountNumber === recipientAccount.accountNumber){
                    AppResponse.error("Sorry, you cannot send money to yourself", HttpStatus.FORBIDDEN);
                }

                //ensure the sender has enough balance to cover the transfer
                if(dto.amount > Number(account.balance)){
                    AppResponse.error('Insufficient account balance', HttpStatus.FORBIDDEN);
                }

                //enforce the daily transaction limit if one is set on the account.
                //we sum all debit transactions made today to see if this transfer
                //would push the total over the configured limit
                if(account.dailyTransactionLimit !== null){
                    const startOfDay = new Date();
                    startOfDay.setHours(0, 0, 0, 0);

                    const todaysDebits = await tx.transaction.aggregate({
                        where: {
                            accountId: account.id,
                            type: TransactionType.DEBIT,
                            createdAt: { gte: startOfDay },
                        },
                        _sum: { amount: true }
                    });

                    const totalSpentToday = Number(todaysDebits._sum.amount ?? 0);
                    const dailyLimit = Number(account.dailyTransactionLimit);

                    if(totalSpentToday + dto.amount > dailyLimit){
                        AppResponse.error(
                            `This transfer would exceed your daily limit of ${dailyLimit}`,
                            HttpStatus.FORBIDDEN
                        );
                    }
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
                        balanceBefore: Number(account.balance),
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
                        balanceBefore: Number(recipientAccount.balance),
                        balanceAfter: Number(recipientAccount.balance) + dto.amount,
                        counterpartyAccountId: account.id,
                    }
                });

                //deduct from sender's balance
                await tx.account.update({
                    where: {id: account.id},
                    data: {
                        balance: { decrement: dto.amount},
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

        //fetches paginated transactions for a specific account.
        //page and limit default to 1 and 10 respectively if not provided
        async getAllTransactions(
            userId: number,
            accountId: number,
            page: number = 1,
            limit: number = 10,
        ) {
            //verify the account exists and belongs to the requesting user
            const account = await this.prisma.account.findUnique({
                where: { id: accountId, userId: userId }
            });

            if(!account){
                AppResponse.error("Account does not exist", HttpStatus.NOT_FOUND);
            }

            const skip = (page - 1) * limit;

            //fetch the page of transactions and the total count in parallel
            const [transactions, total] = await Promise.all([
                this.prisma.transaction.findMany({
                    where: { accountId: account.id },
                    select: {
                        id: true,
                        amount: true,
                        reference: true,
                        status: true,
                        description: true,
                        type: true,
                        balanceBefore: true,
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
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit,
                }),
                this.prisma.transaction.count({
                    where: { accountId: account.id }
                }),
            ]);

            return AppResponse.success("Transactions retrieved successfully", {
                transactions,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                }
            });
        }

        //fetches a single transaction by ID, scoped to the requesting user's accounts
        async getTransaction(userId: number, transactionId: number) {
            const transaction = await this.prisma.transaction.findFirst({
                where: {
                    id: transactionId,
                    account: { userId: userId }
                },
                select: {
                    id: true,
                    amount: true,
                    reference: true,
                    status: true,
                    description: true,
                    type: true,
                    balanceBefore: true,
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
