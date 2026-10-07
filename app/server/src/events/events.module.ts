import { Module } from '@nestjs/common';
import { DatePollsController } from './date-polls.controller';
import { DatePollsService } from './date-polls.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController, DatePollsController],
  providers: [EventsService, DatePollsService],
})
export class EventsModule {}
