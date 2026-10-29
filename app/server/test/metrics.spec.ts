import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { requestLog } from '../src/http/request-log';
import { MetricsController } from '../src/metrics/metrics.controller';
import { RealtimeService } from '../src/realtime/realtime.service';
import { RedisService } from '../src/redis/redis.service';

const token = 'metrics-token-that-is-long-enough-to-pass';

beforeAll(() => {
  vi.stubEnv('IP_HASH_SALT', 'ip-hash-salt-that-is-long-enough-to-pass');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

@Controller('probe')
class ProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

async function start(settings: Record<string, string>) {
  const module = await Test.createTestingModule({
    controllers: [MetricsController, ProbeController],
    providers: [
      { provide: ConfigService, useValue: new ConfigService(settings) },
      { provide: RedisService, useValue: { run: () => Promise.resolve('PONG') } },
      { provide: RealtimeService, useValue: { hocuspocus: { getConnectionsCount: () => 3, getDocumentsCount: () => 2 } } },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.use(requestLog);
  await app.listen(0, '127.0.0.1');
  return { app, base: `${await app.getUrl()}/api/v1` };
}

describe('Metrics endpoint', () => {
  describe('without a token configured', () => {
    let app: INestApplication;
    let base: string;

    beforeAll(async () => ({ app, base } = await start({})));
    afterAll(() => app.close());

    it('answers 404 even with a bearer token', async () => {
      const response = await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${token}` } });
      expect(response.status).toBe(404);
    });
  });

  describe('with a token configured', () => {
    let app: INestApplication;
    let base: string;

    beforeAll(async () => ({ app, base } = await start({ METRICS_TOKEN: token })));
    afterAll(() => app.close());

    it('refuses a missing or wrong token', async () => {
      expect((await fetch(`${base}/metrics`)).status).toBe(401);
      expect((await fetch(`${base}/metrics`, { headers: { authorization: 'Bearer wrong-token' } })).status).toBe(401);
    });

    it('returns Prometheus text with request, Redis and realtime figures', async () => {
      await fetch(`${base}/probe`);

      const response = await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${token}` } });
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(text).toContain('strata_http_requests_total{method="GET",route="/api/v1/probe",status_class="2xx"} 1');
      expect(text).toContain('strata_auth_failures_total{status="401"} 2');
      expect(text).toContain('strata_redis_up 1');
      expect(text).toContain('strata_realtime_connected_clients 3');
      expect(text).toContain('strata_realtime_open_documents 2');
      expect(text).toContain('process_cpu_user_seconds_total');
    });
  });
});
