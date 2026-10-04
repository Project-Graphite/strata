import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { itemKinds } from '../../items/dto/items.dto';
import { Trimmed } from '../../validation/trimmed.decorator';

export const tidyActions = ['archive', 'trash', 'tag', 'cancel'] as const;
export type TidyActionName = (typeof tidyActions)[number];

export class TidyActionDto {
  @IsIn(tidyActions, { message: 'Choose archive, trash, tag or cancel.' })
  action!: TidyActionName;

  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one item.' })
  @ArrayMaxSize(100, { message: 'Tidy at most 100 items at a time.' })
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'Choose items from the list.' })
  itemIds!: string[];

  @ValidateIf((input: TidyActionDto) => input.action === 'tag')
  @IsUUID('all', { message: 'Choose a tag from the list.' })
  tagId?: string;
}

export class CreateTidyRuleDto {
  @Trimmed()
  @IsString()
  @Length(1, 100, { message: 'Enter 1 to 100 characters to look for.' })
  titleContains!: string;

  @IsOptional()
  @IsIn(itemKinds, { message: 'That is not a kind of item.' })
  kind?: string;

  @IsUUID('all', { message: 'Choose a tag from the list.' })
  tagId!: string;
}

export class UpdateTidyRuleDto {
  @IsBoolean()
  enabled!: boolean;
}
