import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class TransactionPinDto {
    @ApiProperty({ example: 1234 })
    @IsNumber()
    @IsNotEmpty()
    pin: number;

    @ApiProperty({ example: 1234 })
    @IsNumber()
    @IsNotEmpty()
    confirmPin: number;
}
