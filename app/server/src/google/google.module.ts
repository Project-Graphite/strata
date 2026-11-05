import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { UploadQueueModule } from '../files/upload-queue.module';
import { GoogleCalendarModule } from './google-calendar.module';
import { GoogleDriveService } from './google-drive.service';
import { GoogleController } from './google.controller';

@Module({
  imports: [AuthModule, FilesModule, UploadQueueModule, GoogleCalendarModule],
  controllers: [GoogleController],
  providers: [GoogleDriveService],
})
export class GoogleModule {}
