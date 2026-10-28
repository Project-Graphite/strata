import { applyDecorators } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode, NotCardNumber } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';
import { DayText } from '../../validation/day-text.decorator';

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

const httpsUrl = { protocols: ['https'], require_protocol: true };

const Rule = () => applyDecorators(IsString(), MaxLength(300));


const Name = () =>
  applyDecorators(Trimmed(), IsString(), Length(1, 100, { message: 'Names are 1 to 100 characters long.' }));

class SubscriptionDetailsDto {
  @IsOptionalNotNull()
  @IsString()
  @IsTimeZone({ message: 'Choose a time zone from the list.' })
  timeZone?: string;

  @IsOptional()
  @DayText()
  trialEndsOn?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  noticeDays?: number | null;

  @IsOptionalNotNull()
  @IsIn(categories, { message: 'Choose a category from the list.' })
  category?: string;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(40, { message: 'Payment labels are at most 40 characters long.' })
  @NotCardNumber()
  paymentLabel?: string | null;

  @IsOptional()
  @IsUrl(httpsUrl, { message: 'Use an https:// link.' })
  @MaxLength(500)
  cancelUrl?: string | null;

  @IsOptional()
  @IsUrl(httpsUrl, { message: 'Use an https:// link.' })
  @MaxLength(500)
  supportUrl?: string | null;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(200)
  usedBy?: string | null;

  @IsOptional()
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

  @DayText()
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
  @DayText()
  startDate?: string;
}

export class ListSubscriptionsDto {
  @IsOptional()
  @IsIn(['active', 'cancelled'])
  status?: 'active' | 'cancelled';
}
