import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { SpendingModule } from '../spending/spending.module';
import { TasksModule } from '../tasks/tasks.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [EventsModule, InvitationsModule, SpendingModule, TasksModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
