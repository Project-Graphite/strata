import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
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

const Amount = () =>
  applyDecorators(IsInt(), Min(0), Max(100_000_000, { message: 'That price is too large.' }));

const Currency = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)),
    Matches(/^[A-Z]{3}$/, { message: 'Currencies are three-letter codes such as EUR or USD.' }),
  );

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
  @Matches(/^(?!.*\d{5})/, { message: 'Use a label such as "Visa ending 1234". Never enter a full card number.' })
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

  @Amount()
  amountMinor!: number;

  @Currency()
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
  @Amount()
  amountMinor?: number;

  @IsOptionalNotNull()
  @Currency()
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
