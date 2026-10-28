import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../src/redis/redis.service';

describe('RedisService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns once that limits fall back to this process while Redis is down, however many commands fail or reconnects follow', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const redis = new RedisService(new ConfigService({ REDIS_URL: 'redis://127.0.0.1:1' }));

    for (let command = 0; command < 3; command += 1) {
      await expect(redis.run((client) => client.ping())).resolves.toBeUndefined();
    }
    void redis.subscribe('changes', () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await redis.onModuleDestroy();

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('Rate limits and sign-in lockouts now count in this process only'),
      'Redis is reconnecting',
    ]);
  });
});
