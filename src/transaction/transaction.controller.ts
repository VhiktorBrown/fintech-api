import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';
import { AdminFundDto } from './dto/admin-fund.dto';
import { SendMoneyDto } from './dto/send-money.dto';
import { TransactionService } from './transaction.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('transaction')
export class TransactionController {
    constructor(private transactionService: TransactionService){}

    @ApiOperation({ summary: 'Admin: fund a user account from admin balance' })
    @Post('fund-user-account')
    async fundUserAccountByAdmin(
        @GetUser('id') userId: number,
        @Body() dto: AdminFundDto) {
        return this.transactionService.fundUserAccountByAdmin(userId, dto);
    }

    @ApiOperation({ summary: 'Transfer money to another account' })
    @Post('send-money')
    async sendMoney(
        @GetUser('id') userId: number,
        @Body() dto: SendMoneyDto) {
        return this.transactionService.sendMoney(userId, dto);
    }

    //accountId, page and limit are passed as query params since this is a GET request.
    //e.g. GET /transaction/get-all-transactions?accountId=1&page=2&limit=20
    @ApiOperation({ summary: 'List paginated transactions for an account' })
    @Get('get-all-transactions')
    async getAllTransactions(
        @GetUser('id') userId: number,
        @Query('accountId', ParseIntPipe) accountId: number,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.transactionService.getAllTransactions(
            userId,
            accountId,
            page ? Number(page) : 1,
            limit ? Number(limit) : 10,
        );
    }

    //transactionId is passed as a query param — GET /transaction/get-transaction?transactionId=5
    @ApiOperation({ summary: 'Get a single transaction by ID' })
    @Get('get-transaction')
    async getTransaction(
        @GetUser('id') userId: number,
        @Query('transactionId', ParseIntPipe) transactionId: number,
    ) {
        return this.transactionService.getTransaction(userId, transactionId);
    }
}
