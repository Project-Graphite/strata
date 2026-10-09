import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { databaseViews, propertyTypes } from '../database';
import { builtInTemplates } from '../templates';
import { IsColor } from '../../validation/color.decorator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

export class CreateNoteDto {
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(200, { message: 'Titles are at most 200 characters long.' })
  title?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a page from this space.' })
  parentId?: string;

  @IsOptional()
  @IsIn(Object.keys(builtInTemplates), { message: 'Choose a template from the list.' })
  template?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a template from this space.' })
  fromNoteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000, { message: 'Quick notes are at most 10,000 characters long.' })
  text?: string;
  @IsOptionalNotNull()
  @IsBoolean()
  board?: boolean;
}

export class UpdateNoteDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(200, { message: 'Titles are at most 200 characters long.' })
  title?: string;

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsUUID('all', { message: 'Choose a page from this space.' })
  parentId?: string | null;

  @IsOptionalNotNull()
  @IsNumber()
  position?: number;

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  @MaxLength(8, { message: 'An icon is a single emoji.' })
  icon?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  pinned?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  template?: boolean;
}

export class PropertyOptionDto {
  @IsString()
  @Length(1, 40)
  id!: string;

  @Trimmed()
  @IsString()
  @Length(1, 60, { message: 'Option names are 1 to 60 characters long.' })
  name!: string;

  @IsColor()
  color!: string;
}

export class PropertyDto {
  @IsString()
  @Length(1, 40)
  id!: string;

  @Trimmed()
  @IsString()
  @Length(1, 60, { message: 'Property names are 1 to 60 characters long.' })
  name!: string;

  @IsIn(propertyTypes, { message: 'Choose a kind of property from the list.' })
  type!: (typeof propertyTypes)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'A property can have at most 50 options.' })
  @ValidateNested({ each: true })
  @Type(() => PropertyOptionDto)
  options?: PropertyOptionDto[];
}

export class SaveDatabaseDto {
  @IsArray()
  @ArrayMaxSize(30, { message: 'A database can have at most 30 properties.' })
  @ValidateNested({ each: true })
  @Type(() => PropertyDto)
  properties!: PropertyDto[];

  @IsIn(databaseViews, { message: 'Choose table, board, list or calendar.' })
  view!: (typeof databaseViews)[number];

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  groupBy?: string | null;

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  dateBy?: string | null;
}

export class SetPropertiesDto {
  @IsObject()
  values!: Record<string, unknown>;
}

export class CreateCommentDto {
  @Trimmed()
  @IsString()
  @Length(1, 2_000, { message: 'Comments are between 1 and 2,000 characters long.' })
  body!: string;

  @IsOptional()
  @IsUUID('all', { message: 'Reply to a comment on this page.' })
  parentId?: string;
}

export class UpdateCommentDto {
  @Trimmed()
  @IsString()
  @Length(1, 2_000, { message: 'Comments are between 1 and 2,000 characters long.' })
  body!: string;
}

export class PageKindQueryDto {
  @IsIn(['note', 'board'], { message: 'Choose note or board.' })
  kind!: 'note' | 'board';
}
