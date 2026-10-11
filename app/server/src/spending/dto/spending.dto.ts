import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode, NotCardNumber } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

export const spendingCategories = [
  'groceries',
  'eating out',
  'transport',
  'housing',
  'utilities',
  'health',
  'shopping',
  'entertainment',
  'travel',
  'gifts',
  'education',
  'other',
] as const;

const nullable = (_input: object, value: unknown) => value !== null;
const Title = () => applyDecorators(Trimmed(), IsString(), Length(1, 200, { message: 'Describe the expense in 1 to 200 characters.' }));
const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });
const Category = () => IsIn(spendingCategories, { message: 'Choose a category from the list.' });
const PaymentLabel = () =>
  applyDecorators(
    Trimmed(),
    IsString(),
    MaxLength(40, { message: 'Use at most 40 characters.' }),
    NotCardNumber(),
  );

export class CreateExpenseDto {
  @Title()
  title!: string;

  @AmountMinor()
  amountMinor!: number;

  @CurrencyCode()
  currency!: string;

  @DayText()
  spentOn!: string;

  @IsOptional()
  @Category()
  category?: (typeof spendingCategories)[number];

  @IsOptional()
  @ValidateIf(nullable)
  @PaymentLabel()
  paymentLabel?: string | null;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(1_000, { message: 'Keep the note under 1,000 characters.' })
  note?: string;
}

export class UpdateExpenseDto {
  @IsOptionalNotNull()
  @Title()
  title?: string;

  @IsOptionalNotNull()
  @AmountMinor()
  amountMinor?: number;

  @IsOptionalNotNull()
  @CurrencyCode()
  currency?: string;

  @IsOptionalNotNull()
  @DayText()
  spentOn?: string;

  @IsOptionalNotNull()
  @Category()
  category?: (typeof spendingCategories)[number];

  @IsOptional()
  @ValidateIf(nullable)
  @PaymentLabel()
  paymentLabel?: string | null;

  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(1_000, { message: 'Keep the note under 1,000 characters.' })
  note?: string;
}

export class ImportExpensesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one charge to add.' })
  @ArrayMaxSize(500, { message: 'Add at most 500 expenses at a time.' })
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  expenses!: CreateExpenseDto[];
}

export class MonthDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Months look like 2026-10.' })
  month!: string;
}

export class SaveBudgetDto {
  @AmountMinor()
  amountMinor!: number;

  @CurrencyCode()
  currency!: string;
}
