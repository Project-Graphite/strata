import { Global, Module } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, RateLimitGuard],
  exports: [RedisService, RateLimitGuard],
})
export class RedisModule {}
