import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

export class CreateBookmarkDto {
  @Trimmed()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Enter a web address that starts with https://.' })
  @MaxLength(2_000, { message: 'That address is too long.' })
  url!: string;
}

export class ListBookmarksDto {
  @IsOptional()
  @IsIn(['unread', 'read'], { message: 'Choose unread or read.' })
  status?: 'unread' | 'read';
}

export class UpdateBookmarkDto {
  @IsBoolean()
  read!: boolean;
}

export class SaveArticleDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(200)
  siteName?: string;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(200)
  byline?: string;

  @IsArray()
  @ArrayMaxSize(2_000, { message: 'That article is too long to keep.' })
  blocks!: unknown[];
}
