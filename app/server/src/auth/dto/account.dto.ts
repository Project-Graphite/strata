import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const normalizedEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class EmailDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(normalizedEmail)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(64, 64, { message: 'This link is incomplete. Open the whole link from the email.' })
  token!: string;

  @IsString()
  @Length(12, 128, { message: 'Passwords are 12 to 128 characters long.' })
  password!: string;
}

export class ProofDto {
  @IsString()
  @MaxLength(128, { message: 'Passwords are at most 128 characters long.' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Codes are at most 20 characters long.' })
  code?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128, { message: 'Passwords are at most 128 characters long.' })
  currentPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Codes are at most 20 characters long.' })
  code?: string;

  @IsString()
  @Length(12, 128, { message: 'Passwords are 12 to 128 characters long.' })
  newPassword!: string;
}

export class ChangeEmailDto extends ProofDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(normalizedEmail)
  email!: string;
}

export class TwoStepCodeDto {
  @IsString()
  @Length(6, 20, { message: 'Enter the six-digit code or a recovery code.' })
  code!: string;
}

export class CompleteSignInDto extends TwoStepCodeDto {
  @IsString()
  @Length(64, 64, { message: 'This sign-in has expired. Sign in again.' })
  challenge!: string;
}
