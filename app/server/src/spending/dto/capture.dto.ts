import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CurrencyCode } from '../../validation/money.decorators';

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
}

export class QuickEntryDto {
  @IsString()
  @Length(1, 200, { message: 'Write an amount and what it was for, such as 120 talabat.' })
  text!: string;

  @IsOptional()
  @CurrencyCode()
  currency?: string;
}
