import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const stampText = Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value));

export class CaptureMessageDto {
  @IsString()
  @Length(1, 60, { message: 'Senders are 1 to 60 characters.' })
  from!: string;

  @IsString()
  @Length(1, 2_000, { message: 'Messages are 1 to 2,000 characters.' })
  text!: string;

  @IsOptional()
  @stampText
  @Matches(/^\d{0,15}$/, { message: 'Times are milliseconds since 1970.' })
  sentStamp?: string;

  @IsOptional()
  @stampText
  @Matches(/^\d{0,15}$/, { message: 'Times are milliseconds since 1970.' })
  receivedStamp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  app?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  chat?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  allowedChats?: string[];
}
