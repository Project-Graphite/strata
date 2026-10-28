import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { UpdateSiteSettingsDto } from './dto/site.dto';
import { SiteSettingsService } from './site-settings.service';
import { Public } from '../auth/public.decorator';

@Controller()
export class SiteController {
  constructor(private readonly site: SiteSettingsService) {}

  @Public()
  @Get('site')
  get() {
    return this.site.get();
  }

  @Patch('admin/site')
  @UseGuards(AdminGuard)
  update(@Body() input: UpdateSiteSettingsDto) {
    return this.site.update(input);
  }
}
