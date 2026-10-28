import { applyDecorators } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { IsColor } from '../../validation/color.decorator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode, moneyCapMinor } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

export const accountKinds = ['bank_current', 'bank_savings', 'credit_card', 'prepaid', 'wallet', 'online', 'bnpl', 'loan', 'cash', 'investment'] as const;

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
const DueDay = () => applyDecorators(IsInt(), Min(1), Max(31, { message: 'Payments are due on day 1 to 31.' }));
const Balance = () => applyDecorators(IsInt(), Min(-moneyCapMinor), Max(moneyCapMinor, { message: 'That balance is too large.' }));
const Institution = () => applyDecorators(Trimmed(), IsString(), MaxLength(60, { message: 'Use at most 60 characters for the bank or provider.' }));
const Handle = () => applyDecorators(Trimmed(), IsString(), MaxLength(120, { message: 'Use at most 120 characters for the payment address.' }));
const AccountId = () => IsUUID('all', { message: 'Choose an account from the list.' });
const IconName = () => applyDecorators(IsString(), MaxLength(40));

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
  @AmountMinor(moneyCapMinor)
  creditLimitMinor?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @DueDay()
  dueDay?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Institution()
  institution?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Handle()
  handle?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  fundedByAccountId?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IsColor()
  colour?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IconName()
  icon?: string | null;
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
  @AmountMinor(moneyCapMinor)
  creditLimitMinor?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @DueDay()
  dueDay?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Institution()
  institution?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Handle()
  handle?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @AccountId()
  fundedByAccountId?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IsColor()
  colour?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @IconName()
  icon?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  archived?: boolean;
}
