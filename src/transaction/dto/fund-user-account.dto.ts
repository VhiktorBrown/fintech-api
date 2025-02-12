import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class FundUserAccountDto {
    @IsNotEmpty()
    @IsString()
    accountNumber: string;

    @IsNotEmpty()
    @IsNumber()
    transactionPin: number;

    @IsNotEmpty()
    @IsNumber()
    amount: number;

    @IsOptional()
    @IsString()
    description?: string;
}