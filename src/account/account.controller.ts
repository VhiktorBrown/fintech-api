import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import { JwtGuard } from 'src/auth/guard';
import { GetUser } from 'src/auth/decorator';
import { AccountLookupDto } from './dto';

@UseGuards(JwtGuard)
@Controller('account')
export class AccountController {
    constructor(private accountService: AccountService){}

    @Post('account-lookup')
    async accountLookUp(
        @GetUser('id') userId: number,
        @Body() dto: AccountLookupDto){
            console.log(userId);
            return this.accountService.accountLookUp(
                userId, dto
            );
    }

    @Get('get-all-accounts')
    async getAccounts(
        @GetUser('id') userId: number,
    ) {
        return this.accountService.getAccounts(
            userId);
    }

    @Post('get-account-details')
    async getAccountDetails(
        @GetUser('id') userId: number,
        @Body('accountId') accountId: number,
    ) {
        return this.accountService.getAccountDetails(
            userId, accountId
        );
    }

}
