import { SpaceQueryDto } from '../../validation/space-query.dto';
import { Type } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsBase64, IsBoolean, IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
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

  @IsOptional()
  @IsBase64(undefined, { message: 'That page could not be read.' })
  @MaxLength(100_000, { message: 'That page is too long to import.' })
  state?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  quick?: boolean;
}

export class UpdateNoteDto {
  @IsOptionalNotNull()
  @IsUUID('all')
  relativeTo?: string;

  @IsOptionalNotNull()
  @IsIn(['before', 'after'])
  placement?: 'before' | 'after';

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(200)
  expectedTitle?: string;

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

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsUUID('all', { message: 'Choose an image from this space.' })
  cover?: string | null;

  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(500, { message: 'Descriptions are at most 500 characters long.' })
  coverAlt?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  narrow?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  pinned?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  template?: boolean;

  @IsOptionalNotNull()
  @Equals(false, { message: 'A page cannot turn into a note.' })
  quick?: false;
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
  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsDateString()
  expectedRevision?: string | null;

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
  @IsOptionalNotNull()
  @IsObject()
  expectedValues?: Record<string, unknown>;

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

  @IsOptional()
  @Matches(/^[\w-]{1,64}$/, { message: 'Choose a block on this page.' })
  blockId?: string;
}

export class UpdateCommentDto {
  @Trimmed()
  @IsString()
  @Length(1, 2_000, { message: 'Comments are between 1 and 2,000 characters long.' })
  body!: string;
}

export class PageKindQueryDto extends SpaceQueryDto {
  @IsOptional()
  @IsIn(['note', 'board', 'quick'], { message: 'Choose note, board or quick.' })
  kind?: 'note' | 'board' | 'quick';
}

export class PageChildrenQueryDto {
  @IsOptionalNotNull()
  @IsUUID('all')
  parentId?: string;

  @IsOptionalNotNull()
  @IsUUID('all')
  cursor?: string;
}
