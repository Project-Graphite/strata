import { Module } from '@nestjs/common';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { CostSplitsController } from './cost-splits.controller';
import { CostSplitsService } from './cost-splits.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [ExchangeRatesModule],
  controllers: [SubscriptionsController, CostSplitsController],
  providers: [SubscriptionsService, CostSplitsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
