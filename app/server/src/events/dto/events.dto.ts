import { SpaceQueryDto } from '../../validation/space-query.dto';
import { applyDecorators } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsTimeZone, IsUrl, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed, TrimmedLowercase } from '../../validation/trimmed.decorator';
import { DayText } from '../../validation/day-text.decorator';

const TimeText = () => Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Times look like 18:30.' });
const Title = () => applyDecorators(Trimmed(), IsString(), Length(1, 200, { message: 'Event titles are 1 to 200 characters long.' }));
const Note = () =>
  applyDecorators(
    Trimmed(),
    IsString(),
    MaxLength(280, { message: 'Notes are at most 280 characters long.' }),
    Matches(/^(?![\s\S]*(?:\/\/|www\.))[\s\S]*$/, { message: 'Notes cannot contain links.' }),
  );

class EventDetailsDto {
  @IsOptional()
  @TimeText()
  startTime?: string | null;

  @IsOptionalNotNull()
  @DayText()
  endsOn?: string;

  @IsOptional()
  @TimeText()
  endTime?: string | null;

  @IsOptionalNotNull()
  @IsString()
  @IsTimeZone({ message: 'Choose a time zone from the list.' })
  timeZone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  repeatRule?: string | null;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(200, { message: 'Locations are at most 200 characters long.' })
  location?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Use an https:// meeting link.' })
  @MaxLength(500)
  meetingUrl?: string | null;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(5_000, { message: 'Descriptions are at most 5,000 characters long.' })
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40_320)
  reminderMinutes?: number | null;
}

export class CreateEventDto extends EventDetailsDto {
  @Title()
  title!: string;

  @DayText()
  startsOn!: string;
}

export class UpdateEventDto extends EventDetailsDto {
  @IsOptionalNotNull()
  @Title()
  title?: string;

  @IsOptionalNotNull()
  @DayText()
  startsOn?: string;
}

export class AgendaDto extends SpaceQueryDto {
  @DayText()
  from!: string;

  @DayText()
  to!: string;
}

export class InviteGuestDto {
  @Trimmed()
  @IsString()
  @Length(1, 80, { message: 'Guest names are 1 to 80 characters long.' })
  name!: string;

  @IsOptional()
  @TrimmedLowercase()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email?: string;
}

export class RsvpDto {
  @IsIn(['yes', 'no', 'maybe'], { message: 'Answer yes, no or maybe.' })
  response!: 'yes' | 'no' | 'maybe';

  @IsOptional()
  @Note()
  note?: string;
}

export class OpenRsvpDto extends RsvpDto {
  @Trimmed()
  @IsString()
  @Length(1, 80, { message: 'Names are 1 to 80 characters long.' })
  name!: string;
}

class PollOptionDto {
  @DayText()
  startsOn!: string;

  @IsOptional()
  @TimeText()
  startTime?: string | null;
}

export class SetPollDto {
  @IsArray()
  @ArrayMinSize(2, { message: 'Offer at least 2 dates.' })
  @ArrayMaxSize(10, { message: 'Offer at most 10 dates.' })
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  options!: PollOptionDto[];
}

export class PollVotesDto {
  @IsObject({ message: 'Answer yes, maybe or no for each date.' })
  votes!: Record<string, 'yes' | 'maybe' | 'no'>;
}

export class PickPollOptionDto {
  @IsUUID('all', { message: 'Choose one of the dates.' })
  optionId!: string;
}
