import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

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

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128, { message: 'Passwords are at most 128 characters long.' })
  currentPassword!: string;

  @IsString()
  @Length(12, 128, { message: 'Passwords are 12 to 128 characters long.' })
  newPassword!: string;
}

export class ChangeEmailDto extends EmailDto {
  @IsString()
  @MaxLength(128, { message: 'Passwords are at most 128 characters long.' })
  password!: string;
}

export class ConfirmPasswordDto {
  @IsString()
  @MaxLength(128, { message: 'Passwords are at most 128 characters long.' })
  password!: string;
}
