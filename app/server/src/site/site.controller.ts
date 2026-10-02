import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { SystemManagerGuard } from '../admin/system-manager.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateSiteSettingsDto } from './dto/site.dto';
import { SiteSettingsService } from './site-settings.service';

@Controller()
export class SiteController {
  constructor(private readonly site: SiteSettingsService) {}

  @Get('site')
  get() {
    return this.site.get();
  }

  @Patch('admin/site')
  @UseGuards(JwtAuthGuard, SystemManagerGuard)
  update(@Body() input: UpdateSiteSettingsDto) {
    return this.site.update(input);
  }
}
