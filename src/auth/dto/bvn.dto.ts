import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class BvnDto {
    @ApiProperty({ example: '12345678901', description: 'Must be exactly 11 digits' })
    @IsNotEmpty()
    @IsString()
    bvn: string;
}
