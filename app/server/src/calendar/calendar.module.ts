import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarModule } from '../google/google-calendar.module';
import { CalendarController } from './calendar.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { CalendarSubscriptionsService } from './calendar-subscriptions.service';

@Module({
  imports: [AuthModule, GoogleCalendarModule],
  controllers: [CalendarController],
  providers: [CalendarFeedService, CalendarSubscriptionsService],
})
export class CalendarModule {}
