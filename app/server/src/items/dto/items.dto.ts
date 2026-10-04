import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { PageDto } from '../../validation/page.dto';
import { Trimmed } from '../../validation/trimmed.decorator';

export const itemKinds = ['note', 'task', 'event', 'subscription', 'board', 'file', 'list'];

export class ListItemsDto extends PageDto {
  @IsOptional()
  @IsIn(itemKinds, { message: 'That is not a kind of item.' })
  kind?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a tag from the list.' })
  tag?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  archived?: boolean;
}

export class UpdateItemDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(200, { message: 'Titles are at most 200 characters long.' })
  title?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  archived?: boolean;
}

export class SetItemTagsDto {
  @IsArray()
  @ArrayMaxSize(50, { message: 'An item can have at most 50 tags.' })
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'Choose tags from the list.' })
  tagIds!: string[];
}

export class CreateLinkDto {
  @IsUUID('all', { message: 'Choose an item to link to.' })
  targetId!: string;

  @IsIn(['mention', 'reference', 'attachment'], { message: 'Choose mention, reference or attachment.' })
  kind!: 'mention' | 'reference' | 'attachment';
}
