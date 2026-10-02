import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { PageDto } from '../../validation/page.dto';
import { Trimmed } from '../../validation/trimmed.decorator';

const nullable = (value: unknown) => value === null;

export class CreateListDto {
  @Trimmed()
  @IsString()
  @Length(1, 100, { message: 'List names are 1 to 100 characters long.' })
  title!: string;
}

export class TaskFieldsDto {
  @IsOptional()
  @ValidateIf((_input, value) => !nullable(value))
  @IsUUID('all', { message: 'Choose a list from this space.' })
  listId?: string | null;

  @IsOptional()
  @ValidateIf((_input, value) => !nullable(value))
  @IsUUID('all', { message: 'Choose a task from this space.' })
  parentId?: string | null;

  @IsOptional()
  @ValidateIf((_input, value) => !nullable(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Due dates look like 2026-10-31.' })
  dueDate?: string | null;

  @IsOptional()
  @ValidateIf((_input, value) => !nullable(value))
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Due times look like 09:30.' })
  dueTime?: string | null;

  @IsOptionalNotNull()
  @IsString()
  @IsTimeZone({ message: 'Choose a time zone from the list.' })
  timeZone?: string;

  @IsOptional()
  @ValidateIf((_input, value) => !nullable(value))
  @IsString()
  @MaxLength(300, { message: 'Repetition rules are at most 300 characters long.' })
  repeatRule?: string | null;

  @IsOptional()
  @ValidateIf((_input, value) => !nullable(value))
  @IsInt()
  @Min(0)
  @Max(40_320, { message: 'Reminders can be at most four weeks early.' })
  reminderMinutes?: number | null;

  @IsOptional()
  @ValidateIf((_input, value) => !nullable(value))
  @IsUUID('all', { message: 'Choose someone from this space.' })
  assigneeId?: string | null;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(3, { message: 'Priority goes from 0 to 3.' })
  priority?: number;

  @IsOptionalNotNull()
  @IsNumber()
  position?: number;
}

export class CreateTaskDto extends TaskFieldsDto {
  @Trimmed()
  @IsString()
  @Length(1, 200, { message: 'Task titles are 1 to 200 characters long.' })
  title!: string;
}

export class UpdateTaskDto extends TaskFieldsDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @Length(1, 200, { message: 'Task titles are 1 to 200 characters long.' })
  title?: string;
}

export class ListTasksDto extends PageDto {
  @IsOptional()
  @IsUUID('all', { message: 'Choose a list from this space.' })
  listId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  completed?: boolean;
}
