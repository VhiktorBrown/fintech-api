import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
    controllers: [WalletController],
    providers: [WalletService],
    // exported so UserModule can inject WalletService to create a wallet
    // when a user sets their transaction PIN
    exports: [WalletService],
})
export class WalletModule {}
