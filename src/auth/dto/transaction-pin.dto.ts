import { IsNotEmpty, IsNumber, isNotEmpty } from "class-validator";

export class TransactionPinDto {
    @IsNumber()
    @IsNotEmpty()
    pin: number;

    @IsNumber()
    @IsNotEmpty()
    confirmPin: number;
}