import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { UploadQueueModule } from '../files/upload-queue.module';
import { TaskAttachmentsService } from './task-attachments.service';
import { TaskCommentsService } from './task-comments.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [FilesModule, UploadQueueModule],
  controllers: [TasksController],
  providers: [TasksService, TaskCommentsService, TaskAttachmentsService],
  exports: [TasksService],
})
export class TasksModule {}
