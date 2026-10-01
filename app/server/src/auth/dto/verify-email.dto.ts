import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Length(64, 64, { message: 'This link is incomplete. Open the whole link from the email.' })
  token!: string;
}
