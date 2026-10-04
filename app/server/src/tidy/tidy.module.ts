import { Module } from '@nestjs/common';
import { ItemsModule } from '../items/items.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TidyRulesService } from './tidy-rules.service';
import { TidyController } from './tidy.controller';
import { TidyService } from './tidy.service';

@Module({
  imports: [ItemsModule, SubscriptionsModule],
  controllers: [TidyController],
  providers: [TidyService, TidyRulesService],
})
export class TidyModule {}
