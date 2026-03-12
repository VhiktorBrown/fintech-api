import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionSource, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { SendMoneyDto } from './dto/send-money.dto';
import { generateTransactionReference } from 'src/shared/functions';
import { AppResponse } from 'src/shared/app-response';
import * as argon from 'argon2';

@Injectable()
export class TransactionService {
    constructor(private prisma: PrismaService) {}

    async sendMoney(userId: number, dto: SendMoneyDto) {
        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userId } });

            // user.pin holds an argon2 hash, so we must use argon.verify
            // to compare it against the raw pin value from the request
            const pinMatches = await argon.verify(user.pin, dto.transactionPin.toString());
            if (!pinMatches) {
                AppResponse.error('Invalid transaction pin', HttpStatus.FORBIDDEN);
            }

            // fetch sender's wallet
            const senderWallet = await tx.wallet.findUnique({
                where: { userId },
                include: { user: true },
            });

            if (!senderWallet) {
                AppResponse.error('Wallet not found', HttpStatus.NOT_FOUND);
            }

            // fetch recipient via their Paystack virtual account number
            const recipientVA = await tx.virtualAccount.findUnique({
                where: { accountNumber: dto.accountNumber },
            });

            if (!recipientVA) {
                AppResponse.error('Recipient account not found', HttpStatus.NOT_FOUND);
            }

            const recipientWallet = await tx.wallet.findUnique({
                where: { userId: recipientVA.userId },
                include: { user: true },
            });

            if (!recipientWallet) {
                AppResponse.error('Recipient wallet not found', HttpStatus.NOT_FOUND);
            }

            if (!senderWallet.isActive) {
                AppResponse.error('Your wallet is deactivated and cannot send money', HttpStatus.FORBIDDEN);
            }

            if (!recipientWallet.isActive) {
                AppResponse.error('The recipient wallet is deactivated', HttpStatus.FORBIDDEN);
            }

            // prevent self-transfers
            if (senderWallet.id === recipientWallet.id) {
                AppResponse.error('You cannot send money to yourself', HttpStatus.FORBIDDEN);
            }

            if (dto.amount > Number(senderWallet.balance)) {
                AppResponse.error('Insufficient wallet balance', HttpStatus.FORBIDDEN);
            }

            // enforce the daily transaction limit if one is set.
            // we sum all debit transactions today to check whether this transfer
            // would push the total past the configured limit
            if (senderWallet.dailyTransactionLimit !== null) {
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);

                const todaysDebits = await tx.transaction.aggregate({
                    where: {
                        walletId: senderWallet.id,
                        type: TransactionType.DEBIT,
                        createdAt: { gte: startOfDay },
                    },
                    _sum: { amount: true },
                });

                const totalSpentToday = Number(todaysDebits._sum.amount ?? 0);
                const dailyLimit = Number(senderWallet.dailyTransactionLimit);

                if (totalSpentToday + dto.amount > dailyLimit) {
                    AppResponse.error(
                        `This transfer would exceed your daily limit of ₦${dailyLimit}`,
                        HttpStatus.FORBIDDEN,
                    );
                }
            }

            const reference = generateTransactionReference();
            const senderName = `${senderWallet.user.firstName} ${senderWallet.user.lastName}`;
            const recipientName = `${recipientWallet.user.firstName} ${recipientWallet.user.lastName}`;

            // record the debit leg for the sender
            const debitTx = await tx.transaction.create({
                data: {
                    type: TransactionType.DEBIT,
                    source: TransactionSource.INTERNAL,
                    amount: dto.amount,
                    reference,
                    status: TransactionStatus.PENDING,
                    description: dto.description ?? `Transfer to ${recipientName}`,
                    walletId: senderWallet.id,
                    balanceBefore: Number(senderWallet.balance),
                    balanceAfter: Number(senderWallet.balance) - dto.amount,
                    counterpartyWalletId: recipientWallet.id,
                },
            });

            // record the credit leg for the recipient
            const creditTx = await tx.transaction.create({
                data: {
                    type: TransactionType.CREDIT,
                    source: TransactionSource.INTERNAL,
                    amount: dto.amount,
                    reference,
                    status: TransactionStatus.PENDING,
                    description: dto.description ?? `Transfer from ${senderName}`,
                    walletId: recipientWallet.id,
                    balanceBefore: Number(recipientWallet.balance),
                    balanceAfter: Number(recipientWallet.balance) + dto.amount,
                    counterpartyWalletId: senderWallet.id,
                },
            });

            // deduct from sender's balance
            await tx.wallet.update({
                where: { id: senderWallet.id },
                data: { balance: { decrement: dto.amount } },
            });

            // credit the recipient's balance
            await tx.wallet.update({
                where: { id: recipientWallet.id },
                data: { balance: { increment: dto.amount } },
            });

            // mark both legs as successful
            await tx.transaction.update({
                where: { id: debitTx.id },
                data: { status: TransactionStatus.SUCCESS },
            });

            await tx.transaction.update({
                where: { id: creditTx.id },
                data: { status: TransactionStatus.SUCCESS },
            });

            return AppResponse.success('Transfer successful');
        });
    }

    // fetches paginated transactions for the authenticated user's wallet.
    // since there is one wallet per user, no walletId param is needed
    async getAllTransactions(userId: number, page: number = 1, limit: number = 10) {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

        if (!wallet) {
            AppResponse.error('Wallet not found', HttpStatus.NOT_FOUND);
        }

        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            this.prisma.transaction.findMany({
                where: { walletId: wallet.id },
                select: {
                    id: true,
                    type: true,
                    source: true,
                    amount: true,
                    reference: true,
                    status: true,
                    description: true,
                    balanceBefore: true,
                    balanceAfter: true,
                    createdAt: true,
                    counterpartyWallet: {
                        select: {
                            user: {
                                select: { firstName: true, lastName: true },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.transaction.count({ where: { walletId: wallet.id } }),
        ]);

        return AppResponse.success('Transactions retrieved successfully', {
            transactions,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }

    // fetches a single transaction by ID, scoped to the requesting user's wallet
    async getTransaction(userId: number, transactionId: number) {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

        if (!wallet) {
            AppResponse.error('Wallet not found', HttpStatus.NOT_FOUND);
        }

        const transaction = await this.prisma.transaction.findFirst({
            where: {
                id: transactionId,
                walletId: wallet.id,
            },
            select: {
                id: true,
                type: true,
                source: true,
                amount: true,
                reference: true,
                status: true,
                description: true,
                balanceBefore: true,
                balanceAfter: true,
                createdAt: true,
                counterpartyWallet: {
                    select: {
                        user: {
                            select: { firstName: true, lastName: true },
                        },
                    },
                },
            },
        });

        if (!transaction) {
            AppResponse.error('Transaction not found', HttpStatus.NOT_FOUND);
        }

        return AppResponse.success('Transaction found', { transaction });
    }
}
