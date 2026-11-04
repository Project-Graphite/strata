import { Module } from '@nestjs/common';
import { ItemsModule } from '../items/items.module';
import { DiskFileStore, FileStore } from './file-store';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { UploadQueueModule } from './upload-queue.module';
import { PageAccessModule } from '../notes/page-access.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PageFilesController } from './page-files.controller';

@Module({
  imports: [ItemsModule, UploadQueueModule, PageAccessModule, RealtimeModule],
  controllers: [FilesController, PageFilesController, DriveController],
  providers: [FilesService, DriveService, { provide: FileStore, useClass: DiskFileStore }],
  exports: [FilesService, DriveService],
})
export class FilesModule {}
