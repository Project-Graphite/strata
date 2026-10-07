import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Trimmed } from '../../validation/trimmed.decorator';

export class AddCalendarDto {
  @IsOptional()
  @Trimmed()
  @IsString()
  @Length(1, 80, { message: 'Calendar names are 1 to 80 characters long.' })
  name?: string;

  @IsString()
  @MaxLength(2_000, { message: 'That address is too long.' })
  url!: string;
}
