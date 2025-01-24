import { IsNotEmpty, IsString } from "class-validator";

export class BvnDto {
    @IsNotEmpty()
    @IsString()
    bvn: string;
}