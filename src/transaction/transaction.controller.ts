import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { GetUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';
import { FundUserAccountDto } from './dto/fund-user-account.dto';
import { TransactionService } from './transaction.service';

@UseGuards(JwtGuard)
@Controller('transaction')
export class TransactionController {
    constructor(private transactionService: TransactionService){}

    //For Admin funding
    @Post('fund-user-account')
    async fundUserAccountByAdmin(
        @GetUser('id') userId: number,
        @Body() dto: FundUserAccountDto) {
            console.log(`What is happening ${userId}`);
        return this.transactionService.fundUserAccountByAdmin(
            userId, dto
        );
    }

    //For user-user transfer
    @Post('send-money')
    async sendMoney(
        @GetUser('id') userId: number,
        @Body() dto: FundUserAccountDto) {
        return this.transactionService.sendMoney(
            userId, dto
        );
    }

    //Fetch user's transactions
    @Get('get-all-transactions')
    async getAllTransactions(
        @GetUser('id') userId: number,
        @Body('accountId') accountId: number
    ) {
        return this.transactionService.getAllTransactions(
            userId,
            accountId,
        );
    }

    @Post('get-transaction')
    async getTransactions(
        @GetUser('id') userId: number,
        @Body('transactionId') transactionId: number,
    ) {
        return this.transactionService.getTransaction(
            userId, transactionId
        );
    }
    
}
