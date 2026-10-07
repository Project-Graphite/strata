import { Transform } from 'class-transformer';
import { IsBoolean, IsString, IsTimeZone, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';

export class UpdateProfileDto {
  @IsOptionalNotNull()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80, { message: 'Display names are 1 to 80 characters long.' })
  displayName?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(64)
  @IsTimeZone({ message: 'Choose a time zone from the list.' })
  timeZone?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  tidySummary?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  weeklyReview?: boolean;

  @ValidateIf((_input, value) => value !== undefined && value !== null)
  @Matches(/^[A-Z]{3}$/, { message: 'Choose a currency from the list.' })
  homeCurrency?: string | null;
}
