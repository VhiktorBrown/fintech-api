import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { FundUserAccountDto } from './dto/fund-user-account.dto';

@Injectable()
export class TransactionService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ){}

    async fundUserAccountByAdmin(
        dto: FundUserAccountDto
    ) {
        
    }
}
