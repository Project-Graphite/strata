import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf((input: LoginDto) => input.email === undefined)
  @IsString({ message: 'Enter your email or handle.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : value))
  login?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsString()
  @MaxLength(128, { message: 'Passwords are at most 128 characters long.' })
  password!: string;
}
