import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppResponse } from 'src/shared/app-response';
import { encrypt, decrypt } from 'src/shared/encryption';
import { BvnDto, NinDto, PersonalInfoDto, TransactionPinDto } from 'src/auth/dto';
import { ChangePinDto } from './dto';
import { WalletService } from 'src/wallet/wallet.service';
import { PaystackService } from 'src/paystack/paystack.service';
import * as argon from 'argon2';

@Injectable()
export class UserService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
        private walletService: WalletService,
        private paystackService: PaystackService,
    ) {}

    async setPersonalInfo(userId: number, dto: PersonalInfoDto) {
        // check to see if the phone number already exists - it is meant to be unique
        const existingUser = await this.prisma.user.findFirst({
            where: { phoneNumber: dto.phoneNumber }
        });
        if(existingUser && existingUser.id !== userId){
            return AppResponse.error("Phone number already exists", HttpStatus.CONFLICT);
        }

        try {
            const user = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    phoneNumber: dto.phoneNumber,
                    address: dto.address,
                    // dto.dateOfBirth is a validated ISO date string (e.g. "1995-06-15").
                    // Prisma requires a Date object, so we convert it here
                    dateOfBirth: new Date(dto.dateOfBirth),
                },
            });

            delete user.password;
            delete user.bvn;
            delete user.pin;
            delete user.refreshToken;

            return AppResponse.success('Personal info updated successfully', { user });
        } catch (error) {
            console.log(error);
            AppResponse.error('Failed to update personal info', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // saves the user's BVN and marks it as verified.
    // the BVN is encrypted at rest — it is sensitive PII and should never be
    // stored as plain text in case the database is ever compromised
    async setBvn(userId: number, dto: BvnDto) {
        if (dto.bvn.length !== 11) {
            AppResponse.error('BVN must be exactly 11 characters', HttpStatus.BAD_REQUEST);
        }

        // guard checks are intentionally outside the try block — AppResponse.error()
        // throws an HttpException, and if that throw happens inside a catch, the catch
        // would swallow it and replace it with a generic 500 error
        const user = await this.prisma.user.findFirst({ where: { id: userId } });
        if (user.bvn != null) {
            AppResponse.error('BVN has already been set', HttpStatus.CONFLICT);
        }

        try {
            const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
            const encryptedBvn = encrypt(dto.bvn, encryptionKey);

            await this.prisma.user.update({
                where: { id: userId },
                // set bvnVerified to true so downstream checks can trust this field
                data: { bvn: encryptedBvn, bvnVerified: true },
            });

            return AppResponse.success('BVN successfully set');
        } catch (error) {
            AppResponse.error('An unexpected error occurred. Please try again.', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // saves the user's NIN and marks it as verified.
    // encrypted for the same reason as BVN — it is a national identity number
    async setNin(userId: number, dto: NinDto) {
        // same pattern as setBvn — guard checks live outside the try block
        const user = await this.prisma.user.findFirst({ where: { id: userId } });
        if (user.nin != null) {
            AppResponse.error('NIN has already been set', HttpStatus.CONFLICT);
        }

        try {
            const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
            const encryptedNin = encrypt(dto.nin, encryptionKey);

            await this.prisma.user.update({
                where: { id: userId },
                data: { nin: encryptedNin, ninVerified: true },
            });

            return AppResponse.success('NIN successfully set');
        } catch (error) {
            AppResponse.error('Failed to update NIN', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // sets the transaction PIN, creates a wallet, and kicks off the Paystack DVA assignment.
    // the wallet is created immediately (balance: 0, status: PENDING).
    // the virtual account number arrives later via the dedicatedaccount.assign.success webhook
    async setTransactionPin(userId: number, dto: TransactionPinDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            AppResponse.error('User does not exist', HttpStatus.NOT_FOUND);
        }

        if (user.pin !== null) {
            AppResponse.error('Transaction PIN is already set', HttpStatus.CONFLICT);
        }

        if (dto.pin !== dto.confirmPin) {
            AppResponse.error("PINs don't match", HttpStatus.BAD_REQUEST);
        }

        // Paystack requires name and phone to create a customer — ensure they are set
        if (!user.firstName || !user.lastName || !user.phoneNumber) {
            AppResponse.error(
                'Please set your first name, last name, and phone number before creating a wallet',
                HttpStatus.BAD_REQUEST,
            );
        }

        // BVN is required by Paystack for identity verification during DVA assignment
        if (!user.bvnVerified || !user.bvn) {
            AppResponse.error(
                'Please set your BVN before creating a wallet',
                HttpStatus.BAD_REQUEST,
            );
        }

        // prevent duplicate wallet + Paystack customer creation
        const existingWallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (existingWallet) {
            AppResponse.error('Wallet already exists for this account', HttpStatus.CONFLICT);
        }

        const hashedPin = await argon.hash(dto.pin.toString());

        await this.prisma.user.update({
            where: { id: userId },
            data: { pin: hashedPin },
        });

        // decrypt BVN to send to Paystack — it is stored encrypted and must be
        // decrypted here so Paystack can verify the user's identity
        const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
        const plainBvn = decrypt(user.bvn, encryptionKey);

        await this.paystackService.assignDedicatedAccount({
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phoneNumber,
            bvn: plainBvn,
        });

        // create the wallet immediately — virtualAccountStatus defaults to PENDING.
        // it will be set to ACTIVE (or FAILED) when the Paystack webhook fires
        const wallet = await this.walletService.createWalletForUser(userId);

        return AppResponse.success(
            'PIN set and wallet created. Your virtual account is being set up — this usually takes a few seconds.',
            { wallet },
        );
    }

    // verifies the current PIN, then replaces it with a new one
    async changeTransactionPin(userId: number, dto: ChangePinDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!user || !user.pin) {
            AppResponse.error('No transaction PIN is set for this account', HttpStatus.BAD_REQUEST);
        }

        const pinMatches = await argon.verify(user.pin, dto.currentPin.toString());
        if (!pinMatches) {
            AppResponse.error('Current PIN is incorrect', HttpStatus.FORBIDDEN);
        }

        if (dto.newPin !== dto.confirmNewPin) {
            AppResponse.error("New PINs don't match", HttpStatus.BAD_REQUEST);
        }

        const hashedPin = await argon.hash(dto.newPin.toString());
        await this.prisma.user.update({
            where: { id: userId },
            data: { pin: hashedPin },
        });

        return AppResponse.success('Transaction PIN changed successfully');
    }
}
