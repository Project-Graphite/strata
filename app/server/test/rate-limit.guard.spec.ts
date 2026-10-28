import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitGuard } from '../src/redis/rate-limit.guard';

function contextFor(request: object, response = { setHeader: vi.fn() }) {
  return {
    getHandler: () => undefined,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as never;
}

describe('RateLimitGuard', () => {
  afterEach(() => vi.useRealTimers());

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

  it('limits a refresh cookie on its own and keeps a looser ceiling per address', async () => {
    const keys = new Set<string>();
    const reflector = {
      get: () => ({ bucket: 'refresh', limit: 4, windowSeconds: 900, perCookie: { name: 'strata_refresh', limit: 2 } }),
    };
    const guard = new RateLimitGuard(reflector as unknown as Reflector, {
      run: (operation: (client: object) => Promise<number>) =>
        operation({
          incr: (key: string) => {
            keys.add(key);
            return Promise.resolve(1);
          },
          expire: () => Promise.resolve(true),
        }),
    } as never);
    const refresh = (token: string) => contextFor({ ip: '203.0.113.9', cookies: { strata_refresh: token } });

    await expect(guard.canActivate(refresh('first'))).resolves.toBe(true);
    await expect(guard.canActivate(refresh('first'))).resolves.toBe(true);
    await expect(guard.canActivate(refresh('first'))).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(refresh('second'))).resolves.toBe(true);
    await expect(guard.canActivate(refresh('third'))).rejects.toBeInstanceOf(HttpException);

    expect(keys).toContain('rate:refresh:203.0.113.9');
    expect(keys).toContain(`rate:refresh:cookie:${createHash('sha256').update('first').digest('hex')}`);
    expect([...keys].some((key) => key.includes('first'))).toBe(false);
  });

  it('puts every write without a limit of its own into a shared bucket per user, or per address when signed out, and leaves reads alone', async () => {
    const keys: string[] = [];
    const guard = new RateLimitGuard({ get: () => undefined } as unknown as Reflector, {
      run: (operation: (client: object) => Promise<number>) =>
        operation({
          incr: (key: string) => {
            keys.push(key);
            return Promise.resolve(1);
          },
          expire: () => Promise.resolve(true),
        }),
    } as never);
    const member = { ip: '203.0.113.9', user: { id: 'user-id' } };

    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      await expect(guard.canActivate(contextFor({ ...member, method }))).resolves.toBe(true);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await expect(guard.canActivate(contextFor({ ...member, method }))).resolves.toBe(true);
    }
    await guard.canActivate(contextFor({ ip: '203.0.113.9', method: 'POST' }));

    expect(keys).toEqual([...Array<string>(4).fill('rate:writes:user-id'), 'rate:writes:203.0.113.9']);
  });

  it('allows 600 writes per user in five minutes and refuses the next', async () => {
    const guard = new RateLimitGuard({ get: () => undefined } as unknown as Reflector, {
      run: () => Promise.resolve(undefined),
    } as never);
    const write = (id: string) => contextFor({ ip: '203.0.113.9', method: 'PATCH', user: { id } });

    for (let request = 0; request < 600; request += 1) {
      await guard.canActivate(write('busy-user'));
    }

    await expect(guard.canActivate(write('busy-user'))).rejects.toMatchObject({ status: 429 });
    await expect(guard.canActivate(write('other-user'))).resolves.toBe(true);
  });

  it('keeps an explicit limit instead of the shared write bucket', async () => {
    const keys: string[] = [];
    const guard = new RateLimitGuard({ get: () => ({ bucket: 'login', limit: 10, windowSeconds: 900 }) } as unknown as Reflector, {
      run: (operation: (client: object) => Promise<number>) =>
        operation({
          incr: (key: string) => {
            keys.push(key);
            return Promise.resolve(1);
          },
          expire: () => Promise.resolve(true),
        }),
    } as never);

    await guard.canActivate(contextFor({ ip: '203.0.113.9', method: 'POST' }));

    expect(keys).toEqual(['rate:login:203.0.113.9']);
  });

  it('tells a rejected client how many seconds are left in the window', async () => {
    vi.useFakeTimers();
    const reflector = { get: () => ({ bucket: 'login', limit: 1, windowSeconds: 60 }) };
    const guard = new RateLimitGuard(reflector as unknown as Reflector, {
      run: () => Promise.resolve(undefined),
    } as never);
    const response = { setHeader: vi.fn() };

    await guard.canActivate(contextFor({ ip: '203.0.113.9' }, response));
    vi.advanceTimersByTime(20_500);
    await expect(guard.canActivate(contextFor({ ip: '203.0.113.9' }, response))).rejects.toMatchObject({
      status: 429,
    });

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '40');
  });

  it('takes the retry time from Redis when the shared counter is over the limit', async () => {
    const reflector = { get: () => ({ bucket: 'login', limit: 2, windowSeconds: 900 }) };
    const guard = new RateLimitGuard(reflector as unknown as Reflector, {
      run: (operation: (client: object) => Promise<number>) =>
        operation({
          incr: () => Promise.resolve(3),
          expire: () => Promise.resolve(true),
          ttl: () => Promise.resolve(42),
        }),
    } as never);
    const response = { setHeader: vi.fn() };

    await expect(guard.canActivate(contextFor({ ip: '203.0.113.9' }, response))).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });
});
