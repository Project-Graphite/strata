import { SpaceQueryDto } from '../../validation/space-query.dto';
import { applyDecorators } from '@nestjs/common';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

export const goalPeriods = ['year', 'quarter', 'month'] as const;
export const goalStatuses = ['active', 'done', 'dropped'] as const;

const nullable = (_input: object, value: unknown) => value !== null;
const Title = () => applyDecorators(Trimmed(), IsString(), Length(1, 200, { message: 'Goal titles are 1 to 200 characters long.' }));
const Period = () => IsIn(goalPeriods, { message: 'Choose a year, a quarter or a month.' });
const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });
const Why = () => applyDecorators(Trimmed(), IsString(), MaxLength(2_000, { message: 'Keep the reason under 2,000 characters.' }));
const Amount = () => IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Enter a number.' });
const Unit = () => applyDecorators(Trimmed(), IsString(), MaxLength(20, { message: 'Units are at most 20 characters long.' }));

export class CreateGoalDto {
  @Title()
  title!: string;

  @Period()
  period!: (typeof goalPeriods)[number];

  @DayText()
  startsOn!: string;

  @IsOptional()
  @Why()
  why?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @Amount()
  target?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Amount()
  current?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Unit()
  unit?: string | null;
}

export class UpdateGoalDto {
  @IsOptionalNotNull()
  @Title()
  title?: string;

  @IsOptionalNotNull()
  @Period()
  period?: (typeof goalPeriods)[number];

  @IsOptionalNotNull()
  @DayText()
  startsOn?: string;

  @IsOptionalNotNull()
  @IsIn(goalStatuses, { message: 'Choose active, done or dropped.' })
  status?: (typeof goalStatuses)[number];

  @IsOptionalNotNull()
  @Why()
  why?: string;

  @IsOptional()
  @ValidateIf(nullable)
  @Amount()
  target?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Amount()
  current?: number | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Unit()
  unit?: string | null;
}

export class ListGoalsDto extends SpaceQueryDto {
  @IsOptional()
  @IsIn(['active', 'finished'], { message: 'Choose active or finished goals.' })
  status?: 'active' | 'finished';
}

export class GoalHabitsDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20, { message: 'A goal can follow at most 20 habits.' })
  @IsUUID('all', { each: true, message: 'Choose habits from the list.' })
  habitIds!: string[];
}
