import { Global, Module } from '@nestjs/common';
import { SiteController } from './site.controller';
import { SiteSettingsService } from './site-settings.service';

@Global()
@Module({
  controllers: [SiteController],
  providers: [SiteSettingsService],
  exports: [SiteSettingsService],
})
export class SiteModule {}
