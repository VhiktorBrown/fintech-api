import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtGuard } from 'src/auth/guard';
import { GetUser } from 'src/auth/decorator';
import { WalletService } from './wallet.service';
import { WalletLookupDto } from './dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('wallet')
export class WalletController {
    constructor(private walletService: WalletService) {}

    @ApiOperation({ summary: 'Get your wallet (balance, status, virtual account status)' })
    @Get()
    getWallet(@GetUser('id') userId: number) {
        return this.walletService.getWallet(userId);
    }

    @ApiOperation({ summary: 'Get your virtual account details (share this to receive money)' })
    @Get('virtual-account')
    getVirtualAccount(@GetUser('id') userId: number) {
        return this.walletService.getVirtualAccount(userId);
    }

    @ApiOperation({ summary: "Look up a recipient's account by their virtual account number" })
    @Post('lookup')
    walletLookup(
        @GetUser('id') userId: number,
        @Body() dto: WalletLookupDto,
    ) {
        return this.walletService.walletLookup(userId, dto);
    }

    @ApiOperation({ summary: 'Deactivate your wallet — no transfers in or out while inactive' })
    @Patch('deactivate')
    deactivateWallet(@GetUser('id') userId: number) {
        return this.walletService.deactivateWallet(userId);
    }
}
