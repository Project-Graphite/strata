import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { RateLimitGuard } from '../src/redis/rate-limit.guard';

function contextFor(request: object) {
  return {
    getHandler: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('RateLimitGuard', () => {
  it('counts requests per client without Redis and rejects the one over the limit', async () => {
    const reflector = { get: () => ({ bucket: 'login', limit: 2, windowSeconds: 60 }) };
    const guard = new RateLimitGuard(reflector as unknown as Reflector, {
      run: () => Promise.resolve(undefined),
    } as never);
    const request = { ip: '203.0.113.9' };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(
      guard.canActivate(contextFor({ ip: '203.0.113.10' })),
    ).resolves.toBe(true);
  });

  it('keeps the limit when Redis evicts a counter inside its window', async () => {
    const reflector = { get: () => ({ bucket: 'login', limit: 2, windowSeconds: 900 }) };
    const guard = new RateLimitGuard(reflector as unknown as Reflector, {
      run: (operation: (client: object) => Promise<number>) =>
        operation({ incr: () => Promise.resolve(1), expire: () => Promise.resolve(true) }),
    } as never);
    const request = { ip: '203.0.113.9' };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('keys authenticated requests by user', async () => {
    const keys: string[] = [];
    const reflector = { get: () => ({ bucket: 'reviews', limit: 5, windowSeconds: 60 }) };
    const guard = new RateLimitGuard(reflector as unknown as Reflector, {
      run: (operation: (client: object) => Promise<number>) =>
        operation({
          incr: (key: string) => {
            keys.push(key);
            return Promise.resolve(1);
          },
          expire: () => Promise.resolve(true),
        }),
    } as never);

    await guard.canActivate(contextFor({ ip: '203.0.113.9', user: { id: 'user-id' } }));

    expect(keys).toEqual(['rate:reviews:user-id']);
  });
});
