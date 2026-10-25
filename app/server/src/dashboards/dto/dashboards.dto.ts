import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';
import { IsColor } from '../../validation/color.decorator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

export const widgetTypes = ['clock', 'today', 'tasks', 'shortcuts', 'recurring', 'inbox', 'agenda', 'calendar', 'countdown', 'focus', 'progress', 'tidy', 'weather', 'news', 'capture', 'habits', 'journal', 'goals', 'trip', 'birthdays', 'pages', 'board', 'bookmarks', 'files', 'quote', 'spending', 'payments', 'savings'] as const;
const widgetSizes = ['small', 'medium', 'wide', 'full'] as const;
export const paddings = ['compact', 'normal', 'roomy'] as const;
export const templates = ['morning', 'work', 'student', 'travel'] as const;
export const devices = ['any', 'phone', 'desktop'] as const;

export class WidgetDto {
  @IsString()
  @Length(1, 40)
  id!: string;

  @IsIn(widgetTypes, { message: 'That is not a kind of widget.' })
  type!: (typeof widgetTypes)[number];

  @IsOptional()
  @IsIn(widgetSizes, { message: 'Choose small, medium, wide or full.' })
  size?: (typeof widgetSizes)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(11)
  x?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  y?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  w?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(120)
  h?: number | null;

  @IsOptional()
  @Trimmed()
  @IsString()
  @Length(1, 40, { message: 'Card titles are 1 to 40 characters long.' })
  title?: string;

  @IsOptional()
  @IsBoolean()
  hideTitle?: boolean;

  @IsOptional()
  @IsColor()
  accent?: string;

  @IsOptional()
  @IsIn(paddings, { message: 'Choose compact, normal or roomy.' })
  padding?: (typeof paddings)[number];

  @IsObject()
  settings!: Record<string, unknown>;
}

class BackgroundDto {
  @IsOptional()
  @IsColor()
  colour?: string;

  @IsOptional()
  @IsUUID()
  imageId?: string;
}

export class LayoutDto {
  @IsArray()
  @ArrayMaxSize(40, { message: 'A dashboard can hold at most 40 widgets.' })
  @ValidateNested({ each: true })
  @Type(() => WidgetDto)
  widgets!: WidgetDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BackgroundDto)
  background?: BackgroundDto;
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
  @IsInt()
  @Min(0)
  @Max(1439)
  showFrom?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  showUntil?: number | null;

  @IsOptionalNotNull()
  @IsIn(devices, { message: 'Choose any device, phones or computers.' })
  showOn?: (typeof devices)[number];
}
