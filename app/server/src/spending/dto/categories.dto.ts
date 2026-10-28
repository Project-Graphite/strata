import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { IsColor } from '../../validation/color.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

export const categoryKinds = ['expense', 'income'] as const;

const nullable = (_input: object, value: unknown) => value !== null;

export class CategoryDto {
  @Trimmed()
  @IsString()
  @Length(1, 40, { message: 'Name each category in 1 to 40 characters.' })
  name!: string;

  @IsColor()
  colour!: string;

  @IsOptional()
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(40)
  icon?: string | null;

  @IsOptional()
  @IsIn(categoryKinds, { message: 'Categories are for spending or income.' })
  kind?: (typeof categoryKinds)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  previous?: string;
}

export class SaveCategoriesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Keep at least one category.' })
  @ArrayMaxSize(40, { message: 'Use at most 40 categories.' })
  @ValidateNested({ each: true })
  @Type(() => CategoryDto)
  categories!: CategoryDto[];
}

export class CreateMerchantRuleDto {
  @Trimmed()
  @IsString()
  @Length(2, 120, { message: 'Match on 2 to 120 characters of the merchant name.' })
  match!: string;

  @IsOptional()
  @ValidateIf(nullable)
  @Trimmed()
  @IsString()
  @Length(1, 200, { message: 'Rename to 1 to 200 characters.' })
  rename?: string | null;

  @IsOptional()
  @ValidateIf(nullable)
  @Trimmed()
  @IsString()
  @Length(1, 40, { message: 'Choose a category from the list.' })
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  ignore?: boolean;
}
