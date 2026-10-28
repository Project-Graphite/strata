import { IsEmail, IsString, MaxLength } from 'class-validator';
import { TrimmedLowercase } from '../../validation/trimmed.decorator';

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @TrimmedLowercase()
  email!: string;

  @IsString()
  @MaxLength(128, { message: 'Passwords are at most 128 characters long.' })
  password!: string;
}
