import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class NinDto {
    @ApiProperty({ example: '12345678901' })
    @IsNotEmpty()
    @IsString()
    nin: string;
}
