import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class SpaceQueryDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsIn(['account'])
  home?: 'account';
}
