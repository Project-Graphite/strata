import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class JournalQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Choose a year.' })
  year?: number;
}

export class SetMoodDto {
  @ValidateIf((_input, value) => value !== null)
  @IsInt({ message: 'Choose a mood from 1 to 5.' })
  @Min(1, { message: 'Choose a mood from 1 to 5.' })
  @Max(5, { message: 'Choose a mood from 1 to 5.' })
  mood!: number | null;
}
