import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { AccessTokensController } from './access-tokens.controller';
import { AccessTokensService } from './access-tokens.service';
import { ApiReference, ApiReferenceController } from './api-reference';

@Module({
  imports: [AuthModule, DiscoveryModule],
  controllers: [AccessTokensController, ApiReferenceController],
  providers: [AccessTokensService, ApiReference],
})
export class AccessTokensModule {}
