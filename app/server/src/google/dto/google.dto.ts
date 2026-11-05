import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length, Matches } from 'class-validator';
import { DriveQueryDto } from '../../files/dto/files.dto';

export class AddGoogleCalendarDto {
  @IsString()
  @Length(1, 300)
  calendarId!: string;
}

export class ImportDriveFilesDto extends DriveQueryDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one file.' })
  @ArrayMaxSize(20, { message: 'Import at most 20 files at a time.' })
  @Matches(/^[\w-]{10,200}$/, { each: true, message: 'Choose files from Google Drive.' })
  fileIds!: string[];
}
