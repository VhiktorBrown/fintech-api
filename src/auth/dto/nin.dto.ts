import { IsNotEmpty, IsString } from "class-validator";

export class NinDto {
    @IsNotEmpty()
    @IsString()
    nin: string;
}