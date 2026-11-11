import { IsEmail, IsString, MinLength, IsNotEmpty } from "class-validator";

export class SignUpDto {
    @IsEmail()
    email: string;
    @IsString()
    @MinLength(6)
    @IsNotEmpty()
    password: string;
}
