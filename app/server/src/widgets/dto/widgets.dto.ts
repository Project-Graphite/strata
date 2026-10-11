import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { Trimmed } from '../../validation/trimmed.decorator';

export class WeatherQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsIn(['celsius', 'fahrenheit'], { message: 'Choose celsius or fahrenheit.' })
  unit?: 'celsius' | 'fahrenheit';
}

export class PlaceQueryDto {
  @Trimmed()
  @IsString()
  @Length(2, 80, { message: 'Type 2 to 80 characters to search for a place.' })
  name!: string;
}

export class StatusQueryDto {
  @Trimmed()
  @IsString()
  @MaxLength(500, { message: 'Addresses are at most 500 characters long.' })
  url!: string;
}

export class FeedQueryDto {
  @Trimmed()
  @IsString()
  @MaxLength(500, { message: 'Feed addresses are at most 500 characters long.' })
  url!: string;
}
