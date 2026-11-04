import { Global, Module } from '@nestjs/common';
import { PageAccessModule } from '../notes/page-access.module';
import { WatchersController } from './watchers.controller';
import { WatchersService } from './watchers.service';

@Global()
@Module({
  imports: [PageAccessModule],
  controllers: [WatchersController],
  providers: [WatchersService],
  exports: [WatchersService],
})
export class WatchersModule {}