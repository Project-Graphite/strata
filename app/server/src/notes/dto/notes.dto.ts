import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { builtInTemplates } from '../templates';
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
