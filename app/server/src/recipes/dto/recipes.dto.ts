import { applyDecorators } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

export const meals = ['breakfast', 'lunch', 'dinner'] as const;

const nullable = (_input: object, value: unknown) => value !== null;
const Title = () => applyDecorators(Trimmed(), IsString(), Length(1, 200, { message: 'Recipe names are 1 to 200 characters long.' }));
const Count = (most: number, message: string) => applyDecorators(IsOptional(), ValidateIf(nullable), IsInt({ message }), Min(1, { message }), Max(most, { message }));
const Lines = (most: number, what: string) =>
  applyDecorators(
    IsOptionalNotNull(),
    IsArray(),
    ArrayMaxSize(most, { message: `Keep at most ${most} ${what}.` }),
    IsString({ each: true }),
    MaxLength(1_000, { each: true, message: `Each of the ${what} is at most 1,000 characters long.` }),
  );
const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });

class RecipeFieldsDto {
  @Count(100, 'Servings are a whole number from 1 to 100.')
  servings?: number | null;

  @Count(10_000, 'Enter the time in whole minutes.')
  prepMinutes?: number | null;

  @Count(10_000, 'Enter the time in whole minutes.')
  cookMinutes?: number | null;

  @Lines(200, 'ingredients')
  ingredients?: string[];

  @Lines(200, 'steps')
  steps?: string[];

  @IsOptional()
  @ValidateIf(nullable)
  @Trimmed()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Enter a web address that starts with https://.' })
  @MaxLength(2_000)
  sourceUrl?: string | null;
}

export class CreateRecipeDto extends RecipeFieldsDto {
  @Title()
  title!: string;
}

export class UpdateRecipeDto extends RecipeFieldsDto {
  @IsOptionalNotNull()
  @Title()
  title?: string;
}

export class ImportRecipeDto {
  @Trimmed()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Enter a web address that starts with https://.' })
  @MaxLength(2_000)
  url!: string;
}

export class MealPlanWeekDto {
  @DayText()
  from!: string;
}

export class CreateMealDto {
  @DayText()
  day!: string;

  @IsIn(meals, { message: 'Choose breakfast, lunch or dinner.' })
  meal!: (typeof meals)[number];

  @IsOptional()
  @IsUUID('all', { message: 'Choose a recipe from the list.' })
  recipeId?: string;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(200, { message: 'Keep the note under 200 characters.' })
  note?: string;
}
