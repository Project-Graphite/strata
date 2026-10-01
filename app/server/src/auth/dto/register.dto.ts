import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @Length(3, 32, { message: 'Handles are 3 to 32 characters long.' })
  @Matches(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, {
    message: 'Handles use letters, numbers, - and _, and start and end with a letter or number.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  handle!: string;

  @IsString()
  @Length(1, 80, { message: 'Display names are 1 to 80 characters long.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName!: string;

  @IsString()
  @Length(12, 128, { message: 'Passwords are 12 to 128 characters long.' })
  password!: string;
}
