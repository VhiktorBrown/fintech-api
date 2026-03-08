import { Body, Controller, Get, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { JwtGuard } from 'src/auth/guard';
import { GetUser } from 'src/auth/decorator';
import { AccountLookupDto } from './dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('account')
export class AccountController {
    constructor(private accountService: AccountService){}

    @ApiOperation({ summary: 'Look up an account by account number' })
    @Post('lookup')
    async accountLookUp(
        @GetUser('id') userId: number,
        @Body() dto: AccountLookupDto){
        return this.accountService.accountLookUp(userId, dto);
    }

    @ApiOperation({ summary: 'List all accounts belonging to you' })
    @Get()
    async getAccounts(
        @GetUser('id') userId: number,
    ) {
        return this.accountService.getAccounts(userId);
    }

    //accountId is passed as a query param — GET /account/details?accountId=1
    @ApiOperation({ summary: 'Get details of a specific account' })
    @Get('details')
    async getAccountDetails(
        @GetUser('id') userId: number,
        @Query('accountId', ParseIntPipe) accountId: number,
    ) {
        return this.accountService.getAccountDetails(userId, accountId);
    }

    //PATCH /account/deactivate?accountId=1
    @ApiOperation({ summary: 'Deactivate an account (soft delete — reversible by admin)' })
    @Patch('deactivate')
    async deactivateAccount(
        @GetUser('id') userId: number,
        @Query('accountId', ParseIntPipe) accountId: number,
    ) {
        return this.accountService.deactivateAccount(userId, accountId);
    }
}
