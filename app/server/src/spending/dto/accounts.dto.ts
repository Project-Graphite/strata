import { applyDecorators } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

export const accountKinds = ['bank', 'credit', 'wallet', 'cash'] as const;

const nullable = (_input: object, value: unknown) => value !== null;
const Name = () => applyDecorators(Trimmed(), IsString(), Length(1, 60, { message: 'Name the account in 1 to 60 characters.' }));
const Kind = () => IsIn(accountKinds, { message: 'Choose an account type from the list.' });
const CardDigits = () =>
  applyDecorators(IsArray(), ArrayMaxSize(10, { message: 'Add at most 10 cards.' }), Matches(/^\d{4}$/, { each: true, message: 'Card endings are the last 4 digits.' }));
const Senders = () =>
  applyDecorators(
    IsArray(),
    ArrayMaxSize(10, { message: 'Add at most 10 senders.' }),
    IsString({ each: true }),
    Length(1, 40, { each: true, message: 'Senders are 1 to 40 characters.' }),
  );
const Balance = () => applyDecorators(IsInt(), Min(-100_000_000), Max(100_000_000, { message: 'That balance is too large.' }));

export class CreateAccountDto {
  @Name()
  name!: string;

  @IsOptional()
  @Kind()
  kind?: (typeof accountKinds)[number];

  @CurrencyCode()
  currency!: string;

  @IsOptional()
  @CardDigits()
  cardDigits?: string[];

  @IsOptional()
  @Senders()
  senders?: string[];

  @IsOptional()
  @Balance()
  balanceMinor?: number;

  @IsOptional()
  @ValidateIf(nullable)
  @AmountMinor()
  creditLimitMinor?: number | null;
}

export class UpdateAccountDto {
  @IsOptionalNotNull()
  @Name()
  name?: string;

  @IsOptionalNotNull()
  @Kind()
  kind?: (typeof accountKinds)[number];

  @IsOptionalNotNull()
  @CurrencyCode()
  currency?: string;

  @IsOptionalNotNull()
  @CardDigits()
  cardDigits?: string[];

  @IsOptionalNotNull()
  @Senders()
  senders?: string[];

  @IsOptionalNotNull()
  @Balance()
  balanceMinor?: number;

  @IsOptional()
  @ValidateIf(nullable)
  @AmountMinor()
  creditLimitMinor?: number | null;
}
