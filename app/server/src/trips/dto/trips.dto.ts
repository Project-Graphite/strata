import { applyDecorators } from '@nestjs/common';
import { IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { AmountMinor, CurrencyCode } from '../../validation/money.decorators';
import { Trimmed } from '../../validation/trimmed.decorator';

const nullable = (_input: object, value: unknown) => value !== null;
const Title = () => applyDecorators(Trimmed(), IsString(), Length(1, 200, { message: 'Trip names are 1 to 200 characters long.' }));
const Destination = () => applyDecorators(Trimmed(), IsString(), MaxLength(200, { message: 'Keep the destination under 200 characters.' }));
const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });

export class CreateTripDto {
  @Title()
  title!: string;

  @IsOptional()
  @Destination()
  destination?: string;

  @DayText()
  startsOn!: string;

  @DayText()
  endsOn!: string;

  @IsOptional()
  @ValidateIf(nullable)
  @AmountMinor()
  budgetMinor?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @CurrencyCode()
  currency?: string | null;
}

export class UpdateTripDto {
  @IsOptionalNotNull()
  @Title()
  title?: string;

  @IsOptionalNotNull()
  @Destination()
  destination?: string;

  @IsOptionalNotNull()
  @DayText()
  startsOn?: string;

  @IsOptionalNotNull()
  @DayText()
  endsOn?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @AmountMinor()
  budgetMinor?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @CurrencyCode()
  currency?: string | null;
}
