import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [RealtimeModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
