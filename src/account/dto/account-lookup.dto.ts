import { IsNotEmpty, IsString } from "class-validator";

export class AccountLookupDto {
    @IsNotEmpty()
    @IsString()
    accountNumber: string
}