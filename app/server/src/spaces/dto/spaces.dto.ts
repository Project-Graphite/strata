import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { IsColor } from '../../validation/color.decorator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

const NameLength = () => Length(1, 60, { message: 'Space names are 1 to 60 characters long.' });

export class CreateSpaceDto {
  @Trimmed()
  @IsString()
  @NameLength()
  name!: string;

  @IsOptional()
  @IsColor()
  color?: string;
}

export class UpdateSpaceDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @NameLength()
  name?: string;

  @IsOptionalNotNull()
  @IsColor()
  color?: string;
}

export class PageDefaultsDto {
  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  @MaxLength(8, { message: 'An icon is a single emoji.' })
  icon?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  narrow?: boolean;
}

export class BoardDefaultsDto {
  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  @MaxLength(8, { message: 'An icon is a single emoji.' })
  icon?: string | null;
}

export class TaskDefaultsDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @Length(1, 30, { message: 'Task types are 1 to 30 characters long.' })
  type?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(3, { message: 'Priority goes from 0 to 3.' })
  priority?: number;

  @IsOptionalNotNull()
  @IsIn(['creator', 'none'], { message: 'Assign new tasks to their creator or to no one.' })
  assignee?: 'creator' | 'none';
}

export class SpaceDefaultsDto {
  @IsOptionalNotNull()
  @ValidateNested()
  @Type(() => PageDefaultsDto)
  page?: PageDefaultsDto;

  @IsOptionalNotNull()
  @ValidateNested()
  @Type(() => BoardDefaultsDto)
  board?: BoardDefaultsDto;

  @IsOptionalNotNull()
  @ValidateNested()
  @Type(() => TaskDefaultsDto)
  task?: TaskDefaultsDto;
}

export class UpdateSpaceSettingsDto extends UpdateSpaceDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(280, { message: 'Descriptions are at most 280 characters long.' })
  description?: string;

  @IsOptionalNotNull()
  @ValidateNested()
  @Type(() => SpaceDefaultsDto)
  defaults?: SpaceDefaultsDto;
}

export class UpdateMemberDto {
  @IsIn(['owner', 'editor', 'viewer'], { message: 'Choose owner, editor or viewer.' })
  role!: 'owner' | 'editor' | 'viewer';
}
