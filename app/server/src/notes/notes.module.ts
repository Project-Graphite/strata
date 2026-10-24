import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadQueueModule } from '../files/upload-queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NoteCommentsController } from './note-comments.controller';
import { NoteCommentsService } from './note-comments.service';
import { NoteDatabasesService } from './note-databases.service';
import { NoteVersionsService } from './note-versions.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { PageAccessModule } from './page-access.module';
import { PageGrantsController } from './page-grants.controller';
import { PageGrantsService } from './page-grants.service';

@Module({
  imports: [AuthModule, RealtimeModule, UploadQueueModule, PageAccessModule],
  controllers: [NotesController, NoteCommentsController, PageGrantsController],
  providers: [NotesService, NoteVersionsService, NoteDatabasesService, NoteCommentsService, PageGrantsService],
  exports: [NotesService],
})
export class NotesModule {}
