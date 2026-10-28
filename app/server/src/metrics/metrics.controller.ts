import { Controller, Get, Headers, NotFoundException, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisService } from '../redis/redis.service';
import { metrics, realtimeClients, realtimeDocuments, redisUp } from './metrics';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
  ) {}

  @Public()
  @Get()
  async scrape(@Headers('authorization') authorization: string | undefined, @Res({ passthrough: true }) response: Response) {
    const token = this.config.get<string>('METRICS_TOKEN');
    if (!token) throw new NotFoundException();
    if (!timingSafeEqual(digest(authorization ?? ''), digest(`Bearer ${token}`))) throw new UnauthorizedException();
    redisUp.set((await this.redis.run((client) => client.ping())) ? 1 : 0);
    realtimeClients.set(this.realtime.hocuspocus.getConnectionsCount());
    realtimeDocuments.set(this.realtime.hocuspocus.getDocumentsCount());
    response.type(metrics.contentType);
    return metrics.metrics();
  }
}
