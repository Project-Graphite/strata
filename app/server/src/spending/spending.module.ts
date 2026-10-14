import { Module } from '@nestjs/common';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CaptureController } from './capture/capture.controller';
import { CaptureService } from './capture/capture.service';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';

@Module({
  imports: [ExchangeRatesModule],
  controllers: [SpendingController, AccountsController, CaptureController],
  providers: [SpendingService, AccountsService, CaptureService],
})
export class SpendingModule {}
