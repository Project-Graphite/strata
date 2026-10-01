import { Transform } from 'class-transformer';
import { IsString, IsTimeZone, Length, MaxLength } from 'class-validator';
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
}
