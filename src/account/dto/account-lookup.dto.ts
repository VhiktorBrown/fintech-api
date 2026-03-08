import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class AccountLookupDto {
    @ApiProperty({ example: '1234567890' })
    @IsNotEmpty()
    @IsString()
    accountNumber: string;
}
