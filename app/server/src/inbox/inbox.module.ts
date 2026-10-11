import { Global, Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Global()
@Module({
  controllers: [InboxController, PushController],
  providers: [InboxService, PushService],
  exports: [InboxService],
})
export class InboxModule {}
