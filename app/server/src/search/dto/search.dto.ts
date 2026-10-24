import { SpaceQueryDto } from '../../validation/space-query.dto';
import { IsString, Length } from 'class-validator';
import { Trimmed } from '../../validation/trimmed.decorator';

export class SearchDto extends SpaceQueryDto {
  @Trimmed()
  @IsString()
  @Length(1, 100, { message: 'Searches are 1 to 100 characters long.' })
  q!: string;
}
