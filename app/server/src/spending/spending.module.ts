import { Module } from '@nestjs/common';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';

@Module({
  imports: [ExchangeRatesModule],
  controllers: [SpendingController],
  providers: [SpendingService],
})
export class SpendingModule {}
