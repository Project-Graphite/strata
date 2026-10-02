import { IsBoolean } from 'class-validator';

export class UpdateSiteSettingsDto {
  @IsBoolean()
  inviteOnly!: boolean;
}
