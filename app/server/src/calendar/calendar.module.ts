import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { CalendarSubscriptionsService } from './calendar-subscriptions.service';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarFeedService, CalendarSubscriptionsService],
})
export class CalendarModule {}
