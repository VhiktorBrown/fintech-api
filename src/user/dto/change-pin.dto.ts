import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class ChangePinDto {
    @ApiProperty({ example: 1234, description: 'Your current transaction PIN' })
    @IsNotEmpty()
    @IsNumber()
    currentPin: number;

    @ApiProperty({ example: 5678, description: 'Your new transaction PIN' })
    @IsNotEmpty()
    @IsNumber()
    newPin: number;

    @ApiProperty({ example: 5678, description: 'Repeat your new transaction PIN' })
    @IsNotEmpty()
    @IsNumber()
    confirmNewPin: number;
}
