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
        private config: ConfigService,
    ){}

    async fundUserAccountByAdmin(
        userId: number,
        dto: FundUserAccountDto
    ) {
        console.log(userId);
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

            //If sufficient, we create the transaction and deduct money from the admin's account
            const transaction = await tx.transaction.create({
                data: {
                    type: TransactionType.DEBIT,
                    amount: dto.amount,
                    reference: generateTransactionReference(),
                    status: TransactionStatus.PENDING,
                    description: 'Admin funding',
                    senderAccountId: account.id,
                    recipientAccountId: recipientAccount.id,
                }
            });

            //then, deduct the money
            await tx.account.update({
                where: {id: account.id},
                data: { balance : { decrement: dto.amount}}
            });

            //then, add the money to recipient's account
            await tx.account.update({
                where: { id: recipientAccount.id },
                data: { balance: {increment: dto.amount}}
            });

            //update transaction by marking as successful
            await tx.transaction.update({
                where: { id: transaction.id},
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
                    where: { userId: userId }
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
    
                //If sufficient, we create the transaction and deduct money from the admin's account
                const transaction = await tx.transaction.create({
                    data: {
                        type: TransactionType.DEBIT,
                        amount: dto.amount,
                        reference: generateTransactionReference(),
                        status: TransactionStatus.PENDING,
                        description: `Transfer to ${recipientAccount.user.firstName} ${recipientAccount.accountNumber}`,
                        senderAccountId: account.id,
                        recipientAccountId: recipientAccount.id,
                    }
                });
    
                //then, deduct the money
                await tx.account.update({
                    where: {id: account.id},
                    data: { balance : { decrement: dto.amount}}
                });
    
                //then, add the money to recipient's account
                await tx.account.update({
                    where: { id: recipientAccount.id },
                    data: { balance: {increment: dto.amount}}
                });
    
                //update transaction by marking as successful
                await tx.transaction.update({
                    where: { id: transaction.id},
                    data: { status: TransactionStatus.SUCCESS }
                });
    
                return {
                    success: true,
                    message: "Transfer successful"
                };
            })
        }
}
