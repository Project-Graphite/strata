import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsBoolean()
  inviteOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Give everyone at least 1 MB.' })
  @Max(10_240, { message: 'Keep storage at or below 10 GB each.' })
  fileQuotaMb?: number;
}
