import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsOptionalNotNull } from '../../validation/is-optional-not-null.decorator';
import { Trimmed } from '../../validation/trimmed.decorator';

const Name = () => applyDecorators(Trimmed(), IsString(), Length(1, 200, { message: 'Names are 1 to 200 characters long.' }));

class GiftIdeaDto {
  @IsUUID('all')
  id!: string;

  @Trimmed()
  @IsString()
  @Length(1, 200, { message: 'Gift ideas are 1 to 200 characters long.' })
  text!: string;

  @IsBoolean()
  done!: boolean;
}

class PersonDetailsDto {
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(60, { message: 'Keep the relationship under 60 characters.' })
  relationship?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12, { message: 'Choose a month from the list.' })
  birthdayMonth?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31, { message: 'Choose a day from the list.' })
  birthdayDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1900, { message: 'Enter a year after 1900.' })
  @Max(2100, { message: 'Enter a real year.' })
  birthYear?: number | null;

  @IsOptional()
  @Trimmed()
  @IsEmail({}, { message: 'Enter an email address such as sam@example.com.' })
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(40, { message: 'Keep the phone number under 40 characters.' })
  phone?: string | null;

  @IsOptionalNotNull()
  @Trimmed()
  @IsString()
  @MaxLength(5_000, { message: 'Keep notes under 5,000 characters.' })
  notes?: string;
}

export class CreatePersonDto extends PersonDetailsDto {
  @Name()
  name!: string;
}

export class UpdatePersonDto extends PersonDetailsDto {
  @IsOptionalNotNull()
  @Name()
  name?: string;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Keep at most 100 gift ideas.' })
  @ValidateNested({ each: true })
  @Type(() => GiftIdeaDto)
  giftIdeas?: GiftIdeaDto[];
}
