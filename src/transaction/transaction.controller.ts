import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';
import { SendMoneyDto } from './dto/send-money.dto';
import { TransactionService } from './transaction.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('transaction')
export class TransactionController {
    constructor(private transactionService: TransactionService) {}

    @ApiOperation({ summary: 'Transfer money to another user by their virtual account number' })
    @Post('send-money')
    sendMoney(
        @GetUser('id') userId: number,
        @Body() dto: SendMoneyDto,
    ) {
        return this.transactionService.sendMoney(userId, dto);
    }

    // page and limit are optional query params — defaults to page=1, limit=10
    // e.g. GET /transaction/get-all-transactions?page=2&limit=20
    @ApiOperation({ summary: 'List paginated transactions for your wallet' })
    @Get('get-all-transactions')
    getAllTransactions(
        @GetUser('id') userId: number,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.transactionService.getAllTransactions(
            userId,
            page ? Number(page) : 1,
            limit ? Number(limit) : 10,
        );
    }

    // e.g. GET /transaction/get-transaction?transactionId=5
    @ApiOperation({ summary: 'Get a single transaction by ID' })
    @Get('get-transaction')
    getTransaction(
        @GetUser('id') userId: number,
        @Query('transactionId', ParseIntPipe) transactionId: number,
    ) {
        return this.transactionService.getTransaction(userId, transactionId);
    }
}
