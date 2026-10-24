import { IsOptional, IsUUID } from 'class-validator';

export class SpaceQueryDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
