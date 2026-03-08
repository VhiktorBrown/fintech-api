import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsPositive, IsString } from "class-validator";

export class AdminFundDto {
    @ApiProperty({ example: '1234567890' })
    @IsNotEmpty()
    @IsString()
    accountNumber: string;

    @ApiProperty({ example: 1234 })
    @IsNotEmpty()
    @IsNumber()
    transactionPin: number;

    @ApiProperty({ example: 10000 })
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    amount: number;
}
