import { applyDecorators } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, NotEquals, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode, moneyCapMinor } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

export const assetKinds = ['certificate', 'gold', 'property', 'vehicle', 'investment', 'cash', 'other'] as const;

const nullable = (_input: object, value: unknown) => value !== null;
const Name = () => applyDecorators(Trimmed(), IsString(), Length(1, 120, { message: 'Use 1 to 120 characters for the name.' }));
const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });
const AccountId = () => IsUUID('all', { message: 'Choose an account from the list.' });
const Kind = () => IsIn(assetKinds, { message: 'Choose a kind from the list.' });
const Rate = () => applyDecorators(IsNumber(), Min(0), Max(100, { message: 'Rates are 0 to 100 percent.' }));

export class CreateSavingsGoalDto {
  @Name()
  name!: string;

  @CurrencyCode()
  currency!: string;

  @AmountMinor(moneyCapMinor)
  targetMinor!: number;

  @IsOptional()
  @AmountMinor(moneyCapMinor)
  savedMinor?: number;

  @IsOptional()
  @ValidateIf(nullable)
  @DayText()
  dueOn?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  accountId?: string | null;
}

export class UpdateSavingsGoalDto {
  @IsOptionalNotNull()
  @Name()
  name?: string;

  @IsOptionalNotNull()
  @CurrencyCode()
  currency?: string;

  @IsOptionalNotNull()
  @AmountMinor(moneyCapMinor)
  targetMinor?: number;

  @IsOptionalNotNull()
  @AmountMinor(moneyCapMinor)
  savedMinor?: number;

  @IsOptional()
  @ValidateIf(nullable)
  @DayText()
  dueOn?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  accountId?: string | null;
}

export class AddToGoalDto {
  @IsInt()
  @Min(-moneyCapMinor)
  @Max(moneyCapMinor)
  @NotEquals(0, { message: 'Enter an amount to add or take out.' })
  amountMinor!: number;
}

export class CreateAssetDto {
  @Name()
  name!: string;

  @IsOptional()
  @Kind()
  kind?: (typeof assetKinds)[number];

  @CurrencyCode()
  currency!: string;

  @AmountMinor(moneyCapMinor)
  valueMinor!: number;

  @IsOptional()
  @ValidateIf(nullable)
  @Rate()
  ratePercent?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @DayText()
  maturesOn?: string | null;
}

export class UpdateAssetDto {
  @IsOptionalNotNull()
  @Name()
  name?: string;

  @IsOptionalNotNull()
  @Kind()
  kind?: (typeof assetKinds)[number];

  @IsOptionalNotNull()
  @CurrencyCode()
  currency?: string;

  @IsOptionalNotNull()
  @AmountMinor(moneyCapMinor)
  valueMinor?: number;

  @IsOptional()
  @ValidateIf(nullable)
  @Rate()
  ratePercent?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @DayText()
  maturesOn?: string | null;
}
