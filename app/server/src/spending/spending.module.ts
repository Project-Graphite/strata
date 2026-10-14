import { Module } from '@nestjs/common';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CaptureController } from './capture/capture.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CaptureService } from './capture/capture.service';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';

@Module({
  imports: [ExchangeRatesModule],
  controllers: [SpendingController, AccountsController, CaptureController, CategoriesController],
  providers: [SpendingService, AccountsService, CaptureService, CategoriesService],
})
export class SpendingModule {}
