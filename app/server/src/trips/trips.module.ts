import { Module } from '@nestjs/common';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { TasksModule } from '../tasks/tasks.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [ExchangeRatesModule, TasksModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
