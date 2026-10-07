import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

export const widgetTypes = ['clock', 'today', 'tasks', 'shortcuts', 'recurring', 'inbox', 'agenda', 'countdown', 'focus', 'tidy', 'weather', 'news', 'capture', 'habits', 'pages'] as const;
export const widgetSizes = ['small', 'medium', 'wide', 'full'] as const;
export const templates = ['morning', 'work', 'student', 'travel'] as const;
export const devices = ['any', 'phone', 'desktop'] as const;

export class WidgetDto {
  @IsString()
  @Length(1, 40)
  id!: string;

  @IsIn(widgetTypes, { message: 'That is not a kind of widget.' })
  type!: (typeof widgetTypes)[number];

  @IsIn(widgetSizes, { message: 'Choose small, medium, wide or full.' })
  size!: (typeof widgetSizes)[number];

  @IsObject()
  settings!: Record<string, unknown>;
}

export class LayoutDto {
  @IsArray()
  @ArrayMaxSize(40, { message: 'A dashboard can hold at most 40 widgets.' })
  @ValidateNested({ each: true })
  @Type(() => WidgetDto)
  widgets!: WidgetDto[];
}

const DashboardName = () => Length(1, 40, { message: 'Dashboard names are 1 to 40 characters long.' });

export class CreateDashboardDto {
  @Trimmed()
  @IsString()
  @DashboardName()
  name!: string;

  @IsOptional()
  @IsIn(templates, { message: 'Choose a template from the list.' })
  template?: (typeof templates)[number];
}

export class UpdateDashboardDto {
  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @DashboardName()
  name?: string;

  @IsOptionalNotNull()
  @ValidateNested()
  @Type(() => LayoutDto)
  layout?: LayoutDto;

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1439)
  showFrom?: number | null;

  @IsOptional()
  @ValidateIf((_input, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1439)
  showUntil?: number | null;

  @IsOptionalNotNull()
  @IsIn(devices, { message: 'Choose any device, phones or computers.' })
  showOn?: (typeof devices)[number];
}
