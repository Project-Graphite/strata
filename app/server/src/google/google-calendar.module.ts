import { Module } from '@nestjs/common';
import { CalendarSyncNudgeModule } from './calendar-sync-nudge';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  imports: [CalendarSyncNudgeModule],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
