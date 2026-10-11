import { Module } from '@nestjs/common';
import { HabitsModule } from '../habits/habits.module';
import { TasksModule } from '../tasks/tasks.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [HabitsModule, TasksModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
