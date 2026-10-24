import { SpaceQueryDto } from './space-query.dto';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PageDto extends SpaceQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  page = 1;
}
