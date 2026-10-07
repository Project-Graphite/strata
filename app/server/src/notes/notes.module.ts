import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NoteCommentsController } from './note-comments.controller';
import { NoteCommentsService } from './note-comments.service';
import { NoteDatabasesService } from './note-databases.service';
import { NoteVersionsService } from './note-versions.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [NotesController, NoteCommentsController],
  providers: [NotesService, NoteVersionsService, NoteDatabasesService, NoteCommentsService],
  exports: [NotesService],
})
export class NotesModule {}
