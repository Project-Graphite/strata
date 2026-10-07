import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { HabitsModule } from '../habits/habits.module';
import { NotesModule } from '../notes/notes.module';
import { ReviewController } from './review.controller';
import { WeeklyReviewService } from './weekly-review.service';

@Module({
  imports: [AuthModule, EventsModule, HabitsModule, NotesModule],
  controllers: [ReviewController],
  providers: [WeeklyReviewService],
})
export class ReviewModule {}
