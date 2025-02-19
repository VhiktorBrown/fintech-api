import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { FundUserAccountDto } from './dto/fund-user-account.dto';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { generateTransactionReference } from 'src/shared/functions';

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
            //first, we need to confirm that user is an admin
            const user = await tx.user.findUnique({
                where: {id: userId}
            });

            if(!user.isAdmin){
                return new ForbiddenException(
                    'You cannot perform this operation'
                );
            }
            /*
                For testing purposes, there's only going to be one admin account.
                So, that we will use that for funding user accounts.
            */

            //check if transaction pin is correct
            if(user.pin !== dto.transactionPin.toString()){
                return new ForbiddenException(
                    "Invalid transaction pin"
                );
            }

            //Fetch admin's account.
            const account = await tx.account.findFirst({
                where: { userId: userId }
            });

            //fetch recipient's account
            const recipientAccount = await tx.account.findUnique({
                where: { accountNumber: dto.accountNumber}
            });

            if(!recipientAccount){
                throw new ForbiddenException(
                    "Account does not exist"
                );
            }

            //prevent user/admin from funding themselves
            if(account.accountNumber === recipientAccount.accountNumber){
                throw new ForbiddenException(
                    "Sorry, you cannot fund yourself."
                );
            }

            //If reciepient account not found
            if(!recipientAccount){
                throw new ForbiddenException('Account details not found');
            }

            //Next, check balance to see if it is sufficient.
            if(dto.amount > account.balance){
                    return new ForbiddenException(
                        'Insufficient account balance'
                    );
            }

            const reference = generateTransactionReference();

            //If sufficient, create a transaction for the sender
            const debitTransaction = await tx.transaction.create({
                data: {
                    type: TransactionType.DEBIT,
                    amount: dto.amount,
                    reference: reference,
                    status: TransactionStatus.PENDING,
                    description: 'Admin funding',
                    accountId: account.id,
                    balancebefore: account.balance,
                    balanceAfter: account.balance - dto.amount,
                    counterpartyAccountId: recipientAccount.id,
                }
            });

            //create a transaction for the recipient
            const creditTransaction = await tx.transaction.create({
                data: {
                    type: TransactionType.CREDIT,
                    amount: dto.amount,
                    reference: reference,
                    status: TransactionStatus.PENDING,
                    description: 'Admin funding',
                    accountId: recipientAccount.id,
                    balancebefore: recipientAccount.balance,
                    balanceAfter: recipientAccount.balance + dto.amount,
                    counterpartyAccountId: account.id,
                }
            });

            //then, deduct the money
            await tx.account.update({
                where: {id: account.id},
                data: { 
                    balance : { decrement: dto.amount},
                    lastTransactionDate: new Date(),
                }
            });

            //then, add the money to recipient's account
            await tx.account.update({
                where: { id: recipientAccount.id },
                data: { 
                    balance: {increment: dto.amount},
                    lastTransactionDate: new Date(),
                }
            });

            //update debit transaction by marking as successful
            await tx.transaction.update({
                where: { id: debitTransaction.id},
                data: { status: TransactionStatus.SUCCESS }
            });

            //update credit transaction by marking as successful
            await tx.transaction.update({
                where: { id: creditTransaction.id},
                data: { status: TransactionStatus.SUCCESS }
            });

            return {
                success: true,
                message: "Admin funding successful"
            };
        });
    }

    async sendMoney(
        userId: number,
        dto: FundUserAccountDto){
            return this.prisma.$transaction(async (tx) => {
                
                const user = await tx.user.findUnique({
                    where: {id: userId}
                });
    
                //check if transaction pin is correct
                if(user.pin !== dto.transactionPin.toString()){
                    return new ForbiddenException(
                        "Invalid transaction pin"
                    );
                }
    
                //Fetch sender's account.
                const account = await tx.account.findFirst({
                    where: { userId: userId },
                    include: { user: true }
                });
    
                //fetch recipient's account
                const recipientAccount = await tx.account.findUnique({
                    where: { accountNumber: dto.accountNumber},
                    include: { user: true } 
                });
    
                //If reciepient account not found
                if(!recipientAccount){
                    throw new ForbiddenException('Account details not found');
                }
    
                //Next, check balance to see if it is sufficient.
                if(dto.amount > account.balance){
                        return new ForbiddenException(
                            'Insufficient account balance'
                        );
                }

                //prevent user from sending money to themselves
                if(account.accountNumber == recipientAccount.accountNumber){
                    throw new ForbiddenException(
                        "Sorry, you cannot send money to yourself"
                    );
                }

                const reference = generateTransactionReference();

                //If sufficient, create a transaction for the sender
                const debitTransaction = await tx.transaction.create({
                    data: {
                        type: TransactionType.DEBIT,
                        amount: dto.amount,
                        reference: reference,
                        status: TransactionStatus.PENDING,
                        description: dto.description 
                        ?? `Transfer to ${recipientAccount.user.firstName} ${recipientAccount.accountNumber}`,
                        accountId: account.id,
                        balancebefore: account.balance,
                        balanceAfter: account.balance - dto.amount,
                        counterpartyAccountId: recipientAccount.id,
                    }
                });

                //create a transaction for the recipient
                const creditTransaction = await tx.transaction.create({
                    data: {
                        type: TransactionType.CREDIT,
                        amount: dto.amount,
                        reference: reference,
                        status: TransactionStatus.PENDING,
                        description: dto.description ??
                         `Transfer from ${account.user.firstName} ${account.accountNumber}`,
                        accountId: recipientAccount.id,
                        balancebefore: recipientAccount.balance,
                        balanceAfter: recipientAccount.balance + dto.amount,
                        counterpartyAccountId: account.id,
                    }
                });
    
                //then, deduct the money
                await tx.account.update({
                    where: {id: account.id},
                    data: { 
                        balance : { decrement: dto.amount},
                        lastTransactionDate: new Date(),
                    }
                });
    
                //then, add the money to recipient's account
                await tx.account.update({
                    where: { id: recipientAccount.id },
                    data: { 
                        balance: {increment: dto.amount},
                        lastTransactionDate: new Date(),
                    }
                });
    
                //update debit transaction by marking as successful
                await tx.transaction.update({
                    where: { id: debitTransaction.id},
                    data: { status: TransactionStatus.SUCCESS }
                });

                //update credit transaction by marking as successful
                await tx.transaction.update({
                    where: { id: creditTransaction.id},
                    data: { status: TransactionStatus.SUCCESS }
                });
    
                return {
                    success: true,
                    message: "Transfer successful"
                };
            })
        }

        //Fetches all user's transactions
        async getAllTransactions(
            userId: number ,
            accountId: number
        ) {
            //check if that account belongs to user
            const account = await this.prisma.account.findUnique({
                where: { id: accountId, userId: userId }
            });

            if(!account){
                return new ForbiddenException(
                    "Account does not exist"
                );
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

            return {
                success: true,
                message: "Transactions retrieved successfully",
                transactions: transactions
            }
        }

        //Fetch a single transaction
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
                throw new ForbiddenException(
                    "Transaction not found"
                );
            }

            return {
                success: true,
                message: "Transaction found",
                transaction: transaction
            };
        }
}
