import { applyDecorators } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode, NotCardNumber } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

export const categories = [
  'streaming',
  'music',
  'software',
  'cloud',
  'news',
  'fitness',
  'utilities',
  'phone and internet',
  'insurance',
  'housing',
  'transport',
  'education',
  'other',
];

const date = /^\d{4}-\d{2}-\d{2}$/;
const nullable = (_input: object, value: unknown) => value !== null;
const httpsUrl = { protocols: ['https'], require_protocol: true };

const Rule = () => applyDecorators(IsString(), MaxLength(300));

const DateText = () => Matches(date, { message: 'Dates look like 2026-10-31.' });

const Name = () =>
  applyDecorators(Trimmed(), IsString(), Length(1, 100, { message: 'Names are 1 to 100 characters long.' }));

class SubscriptionDetailsDto {
  @IsOptionalNotNull()
  @IsString()
  @IsTimeZone({ message: 'Choose a time zone from the list.' })
  timeZone?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @DateText()
  trialEndsOn?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IsInt()
  @Min(0)
  @Max(365)
  noticeDays?: number | null;

  @IsOptionalNotNull()
  @IsIn(categories, { message: 'Choose a category from the list.' })
  category?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @Trimmed()
  @IsString()
  @MaxLength(40, { message: 'Payment labels are at most 40 characters long.' })
  @NotCardNumber()
  paymentLabel?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IsUrl(httpsUrl, { message: 'Use an https:// link.' })
  @MaxLength(500)
  cancelUrl?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IsUrl(httpsUrl, { message: 'Use an https:// link.' })
  @MaxLength(500)
  supportUrl?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Trimmed()
  @IsString()
  @MaxLength(200)
  usedBy?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IsInt()
  @Min(0)
  @Max(60, { message: 'Reminders can be at most 60 days early.' })
  reminderDays?: number | null;
}

export class CreateSubscriptionDto extends SubscriptionDetailsDto {
  @Name()
  name!: string;

  @AmountMinor()
  amountMinor!: number;

  @CurrencyCode()
  currency!: string;

  @Rule()
  repeatRule!: string;

  @DateText()
  startDate!: string;
}

export class UpdateSubscriptionDto extends SubscriptionDetailsDto {
  @IsOptionalNotNull()
  @Name()
  name?: string;

  @IsOptionalNotNull()
  @AmountMinor()
  amountMinor?: number;

  @IsOptionalNotNull()
  @CurrencyCode()
  currency?: string;

  @IsOptionalNotNull()
  @Rule()
  repeatRule?: string;

  @IsOptionalNotNull()
  @DateText()
  startDate?: string;
}

export class ListSubscriptionsDto {
  @IsOptional()
  @IsIn(['active', 'cancelled'])
  status?: 'active' | 'cancelled';
}
