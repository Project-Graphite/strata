import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Trimmed } from '../../validation/trimmed.decorator';

const normalizedEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

class NoteDto {
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(280, { message: 'Notes are at most 280 characters long.' })
  @Matches(/^(?![\s\S]*(?:\/\/|www\.))[\s\S]*$/, { message: 'Notes cannot contain links.' })
  note?: string;
}

export class InviteToStrataDto extends NoteDto {
  @IsOptional()
  @Transform(normalizedEmail)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email?: string;
}

export class InviteToSpaceDto extends NoteDto {
  @ValidateIf((input: InviteToSpaceDto) => input.handle === undefined)
  @Transform(normalizedEmail)
  @IsEmail({}, { message: 'Enter an email address or a handle.' })
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : value,
  )
  @IsString()
  @Length(3, 32, { message: 'Handles are 3 to 32 characters long.' })
  handle?: string;

  @IsIn(['owner', 'editor', 'viewer'], { message: 'Choose owner, editor or viewer.' })
  role!: 'owner' | 'editor' | 'viewer';
}
