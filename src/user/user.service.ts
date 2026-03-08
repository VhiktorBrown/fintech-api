import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppResponse } from 'src/shared/app-response';
import { encrypt } from 'src/shared/encryption';
import { BvnDto, NinDto, PersonalInfoDto, TransactionPinDto } from 'src/auth/dto';
import { ChangePinDto } from './dto';
import { AccountService } from 'src/account/account.service';
import * as argon from 'argon2';

@Injectable()
export class UserService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
        private accountService: AccountService,
    ) {}

    //updates the user's profile information
    async setPersonalInfo(userId: number, dto: PersonalInfoDto) {
        try {
            const user = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    phoneNumber: dto.phoneNumber,
                    address: dto.address,
                    //dto.dateOfBirth is a validated ISO date string (e.g. "1995-06-15").
                    //Prisma requires a Date object, so we convert it here
                    dateOfBirth: new Date(dto.dateOfBirth),
                }
            });

            delete user.password;
            delete user.bvn;
            delete user.pin;
            delete user.refreshToken;

            return AppResponse.success("Personal info updated successfully", { user });
        } catch (error) {
            AppResponse.error('Failed to update personal info', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    //saves the user's BVN and marks it as verified.
    //the BVN is encrypted at rest — it is sensitive PII and should never be
    //stored as plain text in case the database is ever compromised
    async setBvn(userId: number, dto: BvnDto) {
        if (dto.bvn.length !== 11) {
            AppResponse.error("BVN must be exactly 11 characters", HttpStatus.BAD_REQUEST);
        }

        //guard checks are intentionally outside the try block — AppResponse.error()
        //throws an HttpException, and if that throw happens inside a catch, the catch
        //would swallow it and replace it with a generic 500 error
        const user = await this.prisma.user.findFirst({ where: { id: userId } });
        if (user.bvn != null) {
            AppResponse.error("BVN has already been set", HttpStatus.CONFLICT);
        }

        try {
            const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
            const encryptedBvn = encrypt(dto.bvn, encryptionKey);

            await this.prisma.user.update({
                where: { id: userId },
                //set bvnVerified to true so downstream checks can trust this field
                data: { bvn: encryptedBvn, bvnVerified: true }
            });

            return AppResponse.success("BVN successfully set");
        } catch (error) {
            AppResponse.error("An unexpected error occurred. Please try again.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    //saves the user's NIN and marks it as verified.
    //encrypted for the same reason as BVN — it is a national identity number
    async setNin(userId: number, dto: NinDto) {
        //same pattern as setBvn — guard checks live outside the try block
        const user = await this.prisma.user.findFirst({ where: { id: userId } });
        if (user.nin != null) {
            AppResponse.error("NIN has already been set", HttpStatus.CONFLICT);
        }

        try {
            const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
            const encryptedNin = encrypt(dto.nin, encryptionKey);

            await this.prisma.user.update({
                where: { id: userId },
                //set ninVerified to true so downstream checks can trust this field
                data: { nin: encryptedNin, ninVerified: true }
            });

            return AppResponse.success("NIN successfully set");
        } catch (error) {
            AppResponse.error("Failed to update NIN", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    //sets the transaction PIN and creates a bank account for the user.
    //account creation is deferred until PIN setup so every account is secured from day one
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

        const hashedPin = await argon.hash(dto.pin.toString());

        await this.prisma.user.update({
            where: { id: userId },
            data: { pin: hashedPin }
        });

        //create a bank account now that the user has secured their profile with a PIN.
        //admin accounts receive an initial seed balance; regular accounts start at zero
        await this.accountService.createAccountForUser(userId, user.isAdmin);

        return AppResponse.success("Transaction PIN set and account created successfully");
    }

    //verifies the current PIN, then replaces it with a new one
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
            data: { pin: hashedPin }
        });

        return AppResponse.success("Transaction PIN changed successfully");
    }
}
