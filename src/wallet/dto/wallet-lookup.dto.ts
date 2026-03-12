import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class WalletLookupDto {
    @ApiProperty({ example: '1234567890', description: "Recipient's Paystack virtual account number" })
    @IsNotEmpty()
    @IsString()
    accountNumber: string;
}
