import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarSyncNudgeModule } from '../google/calendar-sync-nudge';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { PageAccessModule } from '../notes/page-access.module';

@Module({
  imports: [AuthModule, PageAccessModule, CalendarSyncNudgeModule],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
