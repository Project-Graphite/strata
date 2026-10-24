import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ShareLinksController } from './share-links.controller';
import { ShareLinksService } from './share-links.service';
import { PageAccessModule } from '../notes/page-access.module';

@Module({
  imports: [FilesModule, RealtimeModule, PageAccessModule],
  controllers: [ShareLinksController],
  providers: [ShareLinksService],
})
export class ShareLinksModule {}
