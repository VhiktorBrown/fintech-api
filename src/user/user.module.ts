import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { PaystackModule } from 'src/paystack/paystack.module';

@Module({
    // WalletModule provides WalletService to create the wallet after PIN is set
    // PaystackModule provides PaystackService to initiate DVA assignment
    imports: [WalletModule, PaystackModule],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
