import { IsOptional, IsString, Length } from 'class-validator';
import { IsColor } from '../../validation/color.decorator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

const NameLength = () => Length(1, 40, { message: 'Tag names are 1 to 40 characters long.' });

export class CreateTagDto {
  @Trimmed()
  @IsString()
  @NameLength()
  name!: string;

  @IsOptional()
  @IsColor()
  color?: string;
}

export class UpdateTagDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @NameLength()
  name?: string;

  @IsOptionalNotNull()
  @IsColor()
  color?: string;
}
