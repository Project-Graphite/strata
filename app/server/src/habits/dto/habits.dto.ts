import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

const HabitName = () => Length(1, 80, { message: 'Habit names are 1 to 80 characters long.' });

export class CreateHabitDto {
  @Trimmed()
  @IsString()
  @HabitName()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Aim for 1 to 7 days a week.' })
  @Max(7, { message: 'Aim for 1 to 7 days a week.' })
  perWeek?: number;
}

export class UpdateHabitDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @HabitName()
  name?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1, { message: 'Aim for 1 to 7 days a week.' })
  @Max(7, { message: 'Aim for 1 to 7 days a week.' })
  perWeek?: number;
}
