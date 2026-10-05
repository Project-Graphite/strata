import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NoteVersionsService } from './note-versions.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [NotesController],
  providers: [NotesService, NoteVersionsService],
  exports: [NotesService],
})
export class NotesModule {}
