import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { ShareCodeDto } from '../../validation/link-code.dto';

const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const slugMessage = 'Use 3 to 40 lowercase letters, numbers and dashes, starting and ending with a letter or number.';

export class CreateShareLinkDto {
  @IsIn(['view', 'edit'], { message: 'Choose view or edit.' })
  access!: 'view' | 'edit';

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Links last at least 1 day.' })
  @Max(365, { message: 'Links last at most 365 days.' })
  expiresInDays?: number;

  @IsOptional()
  @IsInt()
  @Min(30, { message: 'Links last at least 30 minutes.' })
  @Max(525_600, { message: 'Links last at most 365 days.' })
  expiresInMinutes?: number | null;

  @IsOptional()
  @Matches(slugPattern, { message: slugMessage })
  slug?: string;
}

export class UpdateShareLinkDto {
  @IsOptional()
  @Matches(slugPattern, { message: slugMessage })
  slug?: string;

  @IsOptional()
  @IsIn(['view', 'edit'], { message: 'Choose view or edit.' })
  access?: 'view' | 'edit';
}

export class SharedFileParamsDto extends ShareCodeDto {
  @IsUUID('all', { message: 'Choose a file from this link.' })
  fileId!: string;
}
