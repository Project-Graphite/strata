import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ShareLinksController } from './share-links.controller';
import { ShareLinksService } from './share-links.service';

@Module({
  imports: [FilesModule, RealtimeModule],
  controllers: [ShareLinksController],
  providers: [ShareLinksService],
})
export class ShareLinksModule {}
