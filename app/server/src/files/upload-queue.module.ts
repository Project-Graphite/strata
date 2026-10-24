import { Module } from '@nestjs/common';
import { UploadQueue } from './upload-queue';

@Module({
  providers: [UploadQueue],
  exports: [UploadQueue],
})
export class UploadQueueModule {}
