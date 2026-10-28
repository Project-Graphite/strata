import { applyDecorators } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';
import { DayText } from '../../validation/day-text.decorator';

const Name = () => applyDecorators(Trimmed(), IsString(), Length(1, 120, { message: 'Name the plan in 1 to 120 characters.' }));
const Count = () => applyDecorators(IsInt(), Min(1), Max(120, { message: 'Plans run for 1 to 120 months.' }));
const ReminderDays = () => applyDecorators(IsInt(), Min(0), Max(14, { message: 'Remind 0 to 14 days before.' }));
const AccountId = () => IsUUID('all', { message: 'Choose an account from the list.' });

export class CreateInstallmentDto {
  @Name()
  name!: string;

  @CurrencyCode()
  currency!: string;

  @AmountMinor()
  monthlyMinor!: number;

  @Count()
  count!: number;

  @DayText()
  firstDueOn!: string;

  @IsOptional()
  @ReminderDays()
  reminderDays?: number;

  @IsOptional()
  @AccountId()
  accountId?: string | null;
}

export class UpdateInstallmentDto {
  @IsOptionalNotNull()
  @Name()
  name?: string;

  @IsOptionalNotNull()
  @CurrencyCode()
  currency?: string;

  @IsOptionalNotNull()
  @AmountMinor()
  monthlyMinor?: number;

  @IsOptionalNotNull()
  @Count()
  count?: number;

  @IsOptionalNotNull()
  @DayText()
  firstDueOn?: string;

  @IsOptionalNotNull()
  @ReminderDays()
  reminderDays?: number;

  @IsOptional()
  @AccountId()
  accountId?: string | null;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(120)
  paidCount?: number;
}
