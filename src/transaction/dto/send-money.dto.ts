import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class SendMoneyDto {
    @ApiProperty({ example: '1234567890' })
    @IsNotEmpty()
    @IsString()
    accountNumber: string;

    @ApiProperty({ example: 1234 })
    @IsNotEmpty()
    @IsNumber()
    transactionPin: number;

    @ApiProperty({ example: 500 })
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    amount: number;

    @ApiPropertyOptional({ example: 'Rent payment' })
    @IsOptional()
    @IsString()
    description?: string;
}
