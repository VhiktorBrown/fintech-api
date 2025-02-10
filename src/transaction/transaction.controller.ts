import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { GetUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';
import { FundUserAccountDto } from './dto/fund-user-account.dto';

UseGuards(JwtGuard)
@Controller('transaction')
export class TransactionController {

    @Post('fund-user-account')
    async fundUserAccountByAdmin(
        @GetUser('id') userId: number,
        @Body() dto: FundUserAccountDto,
    ) {
        
    }
    
}
