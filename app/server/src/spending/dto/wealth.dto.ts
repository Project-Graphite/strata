import { applyDecorators } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, NotEquals } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';
import { DayText } from '../../validation/day-text.decorator';

const assetKinds = ['certificate', 'gold', 'property', 'vehicle', 'investment', 'cash', 'other'] as const;

const Name = () => applyDecorators(Trimmed(), IsString(), Length(1, 120, { message: 'Use 1 to 120 characters for the name.' }));
const AccountId = () => IsUUID('all', { message: 'Choose an account from the list.' });
const Kind = () => IsIn(assetKinds, { message: 'Choose a kind from the list.' });
const Rate = () => applyDecorators(IsNumber(), Min(0), Max(100, { message: 'Rates are 0 to 100 percent.' }));

export class CreateSavingsGoalDto {
  @Name()
  name!: string;

  @CurrencyCode()
  currency!: string;

  @AmountMinor()
  targetMinor!: number;

  @IsOptional()
  @AmountMinor()
  savedMinor?: number;

  @IsOptional()
  @DayText()
  dueOn?: string | null;

  @IsOptional()
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
  @AmountMinor()
  targetMinor?: number;

  @IsOptionalNotNull()
  @AmountMinor()
  savedMinor?: number;

  @IsOptional()
  @DayText()
  dueOn?: string | null;

  @IsOptional()
  @AccountId()
  accountId?: string | null;
}

export class AddToGoalDto {
  @IsInt()
  @Min(-100_000_000)
  @Max(100_000_000)
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

  @AmountMinor()
  valueMinor!: number;

  @IsOptional()
  @Rate()
  ratePercent?: number | null;

  @IsOptional()
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
  @AmountMinor()
  valueMinor?: number;

  @IsOptional()
  @Rate()
  ratePercent?: number | null;

  @IsOptional()
  @DayText()
  maturesOn?: string | null;
}
