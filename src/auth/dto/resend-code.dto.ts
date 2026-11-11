import { IsEmail, IsIn } from 'class-validator';

export class ResendCodeDto {
  @IsEmail()
  email: string;

  @IsIn(['register', 'reset_password'], { message: 'purpose 只能是 register 或 reset_password' })
  purpose: 'register' | 'reset_password';
}
