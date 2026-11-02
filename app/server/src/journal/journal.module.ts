import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { NotesModule } from '../notes/notes.module';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

@Module({
  imports: [AuthModule, EventsModule, NotesModule],
  controllers: [JournalController],
  providers: [JournalService],
})
export class JournalModule {}
