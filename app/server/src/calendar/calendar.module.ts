import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';
import { CalendarFeedService } from './calendar-feed.service';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarFeedService],
})
export class CalendarModule {}
