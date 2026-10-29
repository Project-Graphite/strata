import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode, moneyCapMinor, NotCardNumber } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

export const expenseDirections = ['spent', 'received', 'refund', 'transfer'] as const;
export const expenseKinds = ['purchase', 'atm', 'fee', 'bill', 'transfer', 'card_payment', 'installment', 'salary', 'refund', 'income'] as const;

const nullable = (_input: object, value: unknown) => value !== null;
const Title = () => applyDecorators(Trimmed(), IsString(), Length(1, 200, { message: 'Describe the expense in 1 to 200 characters.' }));
const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });
const CardDigits = () => Matches(/^\d{4}$/, { message: 'A card ending is its last 4 digits.' });
const Category = () => applyDecorators(Trimmed(), IsString(), Length(1, 40, { message: 'Choose a category from the list.' }));
const PaymentLabel = () =>
  applyDecorators(
    Trimmed(),
    IsString(),
    MaxLength(40, { message: 'Use at most 40 characters.' }),
    NotCardNumber(),
  );
const Direction = () => IsIn(expenseDirections, { message: 'Choose spent, received, refund or transfer.' });
const Kind = () => IsIn(expenseKinds, { message: 'Choose a kind of transaction from the list.' });
const AccountId = () => IsUUID('all', { message: 'Choose an account from the list.' });
const Merchant = () => applyDecorators(Trimmed(), IsString(), MaxLength(120, { message: 'Use at most 120 characters for the merchant.' }));

export class CreateExpenseDto {
  @Title()
  title!: string;

  @AmountMinor(moneyCapMinor)
  amountMinor!: number;

  @CurrencyCode()
  currency!: string;

  @DayText()
  spentOn!: string;

  @IsOptional()
  @Category()
  category?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @PaymentLabel()
  paymentLabel?: string | null;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(1_000, { message: 'Keep the note under 1,000 characters.' })
  note?: string;

  @IsOptional()
  @Direction()
  direction?: (typeof expenseDirections)[number];

  @IsOptional()
  @Kind()
  kind?: (typeof expenseKinds)[number];

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  accountId?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  toAccountId?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Merchant()
  merchant?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @CardDigits()
  cardDigits?: string | null;
}

export class UpdateExpenseDto {
  @IsOptionalNotNull()
  @Title()
  title?: string;

  @IsOptionalNotNull()
  @AmountMinor(moneyCapMinor)
  amountMinor?: number;

  @IsOptionalNotNull()
  @CurrencyCode()
  currency?: string;

  @IsOptionalNotNull()
  @DayText()
  spentOn?: string;

  @IsOptionalNotNull()
  @Category()
  category?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @PaymentLabel()
  paymentLabel?: string | null;

  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(1_000, { message: 'Keep the note under 1,000 characters.' })
  note?: string;

  @IsOptionalNotNull()
  @Direction()
  direction?: (typeof expenseDirections)[number];

  @IsOptionalNotNull()
  @Kind()
  kind?: (typeof expenseKinds)[number];

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  accountId?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  toAccountId?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Merchant()
  merchant?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @CardDigits()
  cardDigits?: string | null;
}

export class ImportExpensesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one charge to add.' })
  @ArrayMaxSize(500, { message: 'Add at most 500 expenses at a time.' })
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  expenses!: CreateExpenseDto[];
}

export class TransactionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200, { message: 'Load at most 200 transactions at a time.' })
  limit?: number;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(100, { message: 'Search with at most 100 characters.' })
  q?: string;

  @IsOptional()
  @AccountId()
  account?: string;

  @IsOptional()
  @CardDigits()
  card?: string;

  @IsOptional()
  @Category()
  category?: string;

  @IsOptional()
  @Kind()
  kind?: (typeof expenseKinds)[number];

  @IsOptional()
  @Direction()
  direction?: (typeof expenseDirections)[number];

  @IsOptional()
  @Type(() => Number)
  @AmountMinor(moneyCapMinor)
  min?: number;

  @IsOptional()
  @Type(() => Number)
  @AmountMinor(moneyCapMinor)
  max?: number;
}

export class ExpenseIdsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one transaction.' })
  @ArrayMaxSize(500, { message: 'Change at most 500 transactions at a time.' })
  @IsUUID('all', { each: true, message: 'Choose transactions from the list.' })
  ids!: string[];
}

export class UpdateExpensesDto extends ExpenseIdsDto {
  @IsOptionalNotNull()
  @Category()
  category?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  accountId?: string | null;
}

export class MonthDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Months look like 2026-10.' })
  month?: string;
}

export class SaveBudgetDto {
  @AmountMinor(moneyCapMinor)
  amountMinor!: number;

  @CurrencyCode()
  currency!: string;
}

export class SavePlanDto {
  @ValidateIf(nullable)
  @AmountMinor(moneyCapMinor)
  budgetMinor!: number | null;

  @ValidateIf(nullable)
  @CurrencyCode()
  currency!: string | null;

  @IsInt()
  @Min(1)
  @Max(28, { message: 'Months start on day 1 to 28.' })
  startDay!: number;

  @IsBoolean()
  rollover!: boolean;
}

export class InsightsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(24, { message: 'Look back 2 to 24 months.' })
  months?: number;
}
