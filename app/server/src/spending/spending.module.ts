import { Module } from '@nestjs/common';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CaptureController } from './capture/capture.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { InstallmentsController } from './installments.controller';
import { InstallmentsService } from './installments.service';
import { CaptureService } from './capture/capture.service';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';
import { WealthController } from './wealth.controller';
import { WealthService } from './wealth.service';

@Module({
  imports: [ExchangeRatesModule],
  controllers: [SpendingController, AccountsController, CaptureController, CategoriesController, InstallmentsController, WealthController],
  providers: [SpendingService, AccountsService, CaptureService, CategoriesService, InstallmentsService, WealthService],
})
export class SpendingModule {}
