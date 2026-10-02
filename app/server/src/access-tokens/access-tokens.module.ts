import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessTokensController } from './access-tokens.controller';
import { AccessTokensService } from './access-tokens.service';

@Module({
  imports: [AuthModule],
  controllers: [AccessTokensController],
  providers: [AccessTokensService],
})
export class AccessTokensModule {}
