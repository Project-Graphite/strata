import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
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

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  @MaxLength(40, { message: 'Choose a template from the list.' })
  template?: string | null;
}

export class BoardDefaultsDto {
  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  @MaxLength(8, { message: 'An icon is a single emoji.' })
  icon?: string | null;

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsString()
  @MaxLength(40, { message: 'Choose a template from the list.' })
  template?: string | null;
}

export class AccessDefaultsDto {
  @IsOptionalNotNull()
  @IsIn(['editor', 'viewer'], { message: 'Invite people as editors or viewers.' })
  inviteRole?: 'editor' | 'viewer';

  @IsOptionalNotNull()
  @IsIn(['owners', 'editors'], { message: 'Let owners, or owners and editors, invite people.' })
  inviters?: 'owners' | 'editors';

  @IsOptionalNotNull()
  @IsIn(['owners', 'editors'], { message: 'Let owners, or owners and editors, make share links.' })
  sharers?: 'owners' | 'editors';

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsIn([1, 7, 30, 90, 365], { message: 'Choose how long share links last from the list.' })
  linkDays?: number | null;
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

  @IsOptionalNotNull()
  @IsIn(['open', 'in_progress'], { message: 'New tasks start as to do or in progress.' })
  status?: 'open' | 'in_progress';

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsUUID('all', { message: 'Choose an epic from this space.' })
  listId?: string | null;

  @IsOptionalNotNull()
  @IsIn(['list', 'board'], { message: 'Show new epics as a list or a board.' })
  view?: 'list' | 'board';
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

  @IsOptionalNotNull()
  @ValidateNested()
  @Type(() => AccessDefaultsDto)
  access?: AccessDefaultsDto;
}

export class TransferSpaceDto {
  @IsUUID('all', { message: 'Choose a member to hand the space to.' })
  userId!: string;
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
