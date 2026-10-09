import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { LinkCodeDto } from '../../validation/link-code.dto';

export class CreateShareLinkDto {
  @IsIn(['view', 'edit'], { message: 'Choose view or edit.' })
  access!: 'view' | 'edit';

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Links last at least 1 day.' })
  @Max(365, { message: 'Links last at most 365 days.' })
  expiresInDays?: number;
}

export class SharedFileParamsDto extends LinkCodeDto {
  @IsUUID('all', { message: 'Choose a file from this link.' })
  fileId!: string;
}
