import { applyDecorators } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode, moneyCapMinor } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

const nullable = (_input: object, value: unknown) => value !== null;
const Name = () => applyDecorators(Trimmed(), IsString(), Length(1, 120, { message: 'Name the plan in 1 to 120 characters.' }));
const Count = () => applyDecorators(IsInt(), Min(1), Max(120, { message: 'Plans run for 1 to 120 months.' }));
const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });
const ReminderDays = () => applyDecorators(IsInt(), Min(0), Max(14, { message: 'Remind 0 to 14 days before.' }));
const AccountId = () => IsUUID('all', { message: 'Choose an account from the list.' });

export class CreateInstallmentDto {
  @Name()
  name!: string;

  @CurrencyCode()
  currency!: string;

  @AmountMinor(moneyCapMinor)
  monthlyMinor!: number;

  @Count()
  count!: number;

  @DayText()
  firstDueOn!: string;

  @IsOptional()
  @ReminderDays()
  reminderDays?: number;

  @IsOptional()
  @ValidateIf(nullable)
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
  @AmountMinor(moneyCapMinor)
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
  @ValidateIf(nullable)
  @AccountId()
  accountId?: string | null;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(120)
  paidCount?: number;
}
