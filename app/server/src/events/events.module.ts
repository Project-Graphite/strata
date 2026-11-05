import { Module } from '@nestjs/common';
import { CalendarSyncNudgeModule } from '../google/calendar-sync-nudge';
import { DatePollsController } from './date-polls.controller';
import { DatePollsService } from './date-polls.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [CalendarSyncNudgeModule],
  controllers: [EventsController, DatePollsController],
  providers: [EventsService, DatePollsService],
  exports: [EventsService],
})
export class EventsModule {}
