import { IsIn, IsOptional, IsString, Length } from 'class-validator';
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

export class UpdateMemberDto {
  @IsIn(['owner', 'editor', 'viewer'], { message: 'Choose owner, editor or viewer.' })
  role!: 'owner' | 'editor' | 'viewer';
}
