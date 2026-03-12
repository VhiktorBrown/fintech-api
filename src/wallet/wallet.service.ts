import { HttpStatus, Injectable } from '@nestjs/common';
import { VirtualAccountStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppResponse } from 'src/shared/app-response';
import { WalletLookupDto } from './dto';

@Injectable()
export class WalletService {
    constructor(private prisma: PrismaService) {}

    async getWallet(userId: number) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            AppResponse.error('Wallet not found', HttpStatus.NOT_FOUND);
        }

        return AppResponse.success('Wallet retrieved', { wallet });
    }

    async getVirtualAccount(userId: number) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            AppResponse.error('Wallet not found', HttpStatus.NOT_FOUND);
        }

        if (wallet.virtualAccountStatus !== VirtualAccountStatus.ACTIVE) {
            AppResponse.error(
                wallet.virtualAccountStatus === VirtualAccountStatus.FAILED
                    ? 'Virtual account assignment failed. Please contact support.'
                    : 'Virtual account is still being set up. Please try again shortly.',
                HttpStatus.NOT_FOUND,
            );
        }

        const virtualAccount = await this.prisma.virtualAccount.findUnique({
            where: { userId },
        });

        return AppResponse.success('Virtual account retrieved', { virtualAccount });
    }

    // looks up a user's wallet by their virtual account number — used before P2P transfers
    async walletLookup(userId: number, dto: WalletLookupDto) {
        const virtualAccount = await this.prisma.virtualAccount.findUnique({
            where: { accountNumber: dto.accountNumber },
            include: { user: true },
        });

        if (!virtualAccount) {
            AppResponse.error('Account not found', HttpStatus.NOT_FOUND);
        }

        return AppResponse.success('Account found', {
            account: {
                accountNumber: virtualAccount.accountNumber,
                accountName: virtualAccount.accountName,
                bankName: virtualAccount.bankName,
                name: `${virtualAccount.user.firstName} ${virtualAccount.user.lastName}`,
            },
        });
    }

    async deactivateWallet(userId: number) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            AppResponse.error('Wallet not found', HttpStatus.NOT_FOUND);
        }

        if (!wallet.isActive) {
            AppResponse.error('Wallet is already deactivated', HttpStatus.CONFLICT);
        }

        await this.prisma.wallet.update({
            where: { userId },
            data: { isActive: false },
        });

        return AppResponse.success('Wallet deactivated successfully');
    }

    // called by UserService after PIN is set — creates a wallet with PENDING DVA status
    async createWalletForUser(userId: number) {
        const existing = await this.prisma.wallet.findUnique({ where: { userId } });
        if (existing) return existing;

        return this.prisma.wallet.create({
            data: { userId },
        });
    }
}
