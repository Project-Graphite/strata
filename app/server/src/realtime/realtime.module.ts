import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeService } from './realtime.service';
import { PageAccessModule } from '../notes/page-access.module';

@Module({
  imports: [AuthModule, PageAccessModule],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
