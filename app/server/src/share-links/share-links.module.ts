import { Module } from '@nestjs/common';
import { ShareLinksController } from './share-links.controller';
import { ShareLinksService } from './share-links.service';

@Module({
  controllers: [ShareLinksController],
  providers: [ShareLinksService],
})
export class ShareLinksModule {}
