import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class FundUserAccountDto {
    @IsNotEmpty()
    @IsString()
    accountNumber: string;

    @IsNotEmpty()
    @IsNumber()
    transactionPin: number;
}