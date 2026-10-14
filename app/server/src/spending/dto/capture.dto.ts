import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CaptureMessageDto {
  @IsString()
  @Length(1, 60, { message: 'Senders are 1 to 60 characters.' })
  from!: string;

  @IsString()
  @Length(1, 2_000, { message: 'Messages are 1 to 2,000 characters.' })
  text!: string;

  @IsOptional()
  @Matches(/^\d{0,15}$/, { message: 'Times are milliseconds since 1970.' })
  sentStamp?: string;

  @IsOptional()
  @Matches(/^\d{0,15}$/, { message: 'Times are milliseconds since 1970.' })
  receivedStamp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sim?: string;
}
