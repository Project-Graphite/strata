import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { Trimmed } from '../../validation/trimmed.decorator';

export class DriveQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'Choose a folder from your files.' })
  folderId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose one of your spaces.' })
  spaceId?: string;
}

export class FolderDto {
  @Trimmed()
  @IsString()
  @Length(1, 200, { message: 'Names are 1 to 200 characters long.' })
  name!: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a folder from your files.' })
  parentId?: string;
}

export class RenameDriveItemDto {
  @Trimmed()
  @IsString()
  @Length(1, 200, { message: 'Names are 1 to 200 characters long.' })
  name!: string;
}

export class DriveSelectionDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one file or folder.' })
  @ArrayMaxSize(500, { message: 'Choose at most 500 at a time.' })
  @IsUUID('all', { each: true, message: 'Choose files and folders from your files.' })
  itemIds!: string[];
}

export class MoveDriveItemsDto extends DriveSelectionDto {
  @ValidateIf((_input, value) => value !== null)
  @IsUUID('all', { message: 'Choose a folder from your files.' })
  folderId!: string | null;
}