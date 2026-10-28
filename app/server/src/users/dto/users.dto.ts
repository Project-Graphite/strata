import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsString, IsTimeZone, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { featureKeys } from '../features';

export const timeFormats = ['auto', '12h', '24h'] as const;

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
  @IsIn(timeFormats, { message: 'Choose a time format from the list.' })
  timeFormat?: (typeof timeFormats)[number];

  @IsOptionalNotNull()
  @IsBoolean()
  tidySummary?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  weeklyReview?: boolean;

  @ValidateIf((_input, value) => value !== undefined && value !== null)
  @Matches(/^[A-Z]{3}$/, { message: 'Choose a currency from the list.' })
  homeCurrency?: string | null;

  @IsOptionalNotNull()
  @IsInt({ message: 'Choose the day your week starts on.' })
  @Min(0, { message: 'Choose the day your week starts on.' })
  @Max(6, { message: 'Choose the day your week starts on.' })
  weekStart?: number;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayUnique({ message: 'Choose each weekend day once.' })
  @ArrayMaxSize(6, { message: 'Leave at least one working day in the week.' })
  @IsInt({ each: true, message: 'Choose weekend days from the list.' })
  @Min(0, { each: true, message: 'Choose weekend days from the list.' })
  @Max(6, { each: true, message: 'Choose weekend days from the list.' })
  weekendDays?: number[];

  @IsOptionalNotNull()
  @IsArray()
  @ArrayUnique()
  @IsIn(featureKeys, { each: true, message: 'Choose apps from the list.' })
  features?: string[];
}
