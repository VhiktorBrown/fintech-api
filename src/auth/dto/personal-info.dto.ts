import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsString } from "class-validator";

export class PersonalInfoDto {
    @ApiProperty({ example: 'John' })
    @IsNotEmpty()
    @IsString()
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    @IsNotEmpty()
    @IsString()
    lastName: string;

    @ApiProperty({ example: '08012345678' })
    @IsNotEmpty()
    @IsString()
    phoneNumber: string;

    @ApiProperty({ example: '123 Main Street, Lagos' })
    @IsNotEmpty()
    @IsString()
    address: string;

    @ApiProperty({ example: '1995-06-15', description: 'ISO 8601 date string' })
    @IsNotEmpty()
    @IsDateString()
    dateOfBirth: string;
}
