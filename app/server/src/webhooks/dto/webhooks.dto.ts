import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { activityVerbs } from '../../activity/activity.service';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';

export class CreateWebhookDto {
  @IsString()
  @MaxLength(2_000, { message: 'That address is too long.' })
  url!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one event.' })
  @ArrayMaxSize(activityVerbs.length)
  @IsIn(activityVerbs, { each: true, message: 'Choose events from the list.' })
  events!: string[];

  @IsOptional()
  @IsUUID('all', { message: 'Choose one of your spaces.' })
  spaceId?: string;
}

export class UpdateWebhookDto {
  @IsOptionalNotNull()
  @IsBoolean()
  active?: boolean;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one event.' })
  @ArrayMaxSize(activityVerbs.length)
  @IsIn(activityVerbs, { each: true, message: 'Choose events from the list.' })
  events?: string[];
}
