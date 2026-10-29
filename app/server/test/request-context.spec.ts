import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditEvent } from '../src/audit/audit.service';
import { agentFamily } from '../src/auth/device';
import { addressHash, networkOf, requestContext } from '../src/http/request-context';

const request = (ip: string | undefined, userAgent?: string) => ({ ip, headers: { 'user-agent': userAgent } }) as unknown as Request;

afterEach(() => vi.unstubAllEnvs());

describe('client address hashing', () => {
  it('gives the same address the same short hash under one salt and never the address itself', () => {
    const salt = randomBytes(32).toString('base64');
    const hash = addressHash('203.0.113.7', salt);

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(addressHash('203.0.113.7', salt)).toBe(hash);
    expect(addressHash('203.0.113.8', salt)).not.toBe(hash);
    expect(addressHash('203.0.113.7', randomBytes(32).toString('base64'))).not.toBe(hash);
  });

  it('salts with IP_HASH_SALT, or with a key derived from DATA_ENCRYPTION_KEY when it is unset', () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('IP_HASH_SALT', '');
    const derived = networkOf(request('198.51.100.1')).address;
    vi.stubEnv('IP_HASH_SALT', 'a-production-salt-that-is-long-enough-to-pass');
    const salted = networkOf(request('198.51.100.1')).address;

    expect(derived).toMatch(/^[0-9a-f]{16}$/);
    expect(salted).toBe(addressHash('198.51.100.1', 'a-production-salt-that-is-long-enough-to-pass'));
    expect(salted).not.toBe(derived);
    expect(networkOf(request(undefined)).address).toBeNull();
  });
});

describe('user agent family', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 'Edge'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 'Safari'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0', 'Firefox'],
    ['Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 'Chrome'],
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/141.0.0.0', 'Bot'],
    ['curl/8.15.0', 'Script'],
    ['python-requests/2.32.5', 'Script'],
    ['SomethingElse/1.0', 'Other'],
    [undefined, 'Unknown'],
  ])('reads %s as %s', (userAgent, family) => {
    expect(agentFamily(userAgent)).toBe(family);
  });
});

describe('audit rows during a request', () => {
  it('carry the hashed address and agent family on auth events only', () => {
    vi.stubEnv('IP_HASH_SALT', 'a-production-salt-that-is-long-enough-to-pass');
    const store = { requestId: 'request-id', request: request('192.0.2.10', 'curl/8.15.0') };
    const network = { address: addressHash('192.0.2.10', 'a-production-salt-that-is-long-enough-to-pass'), agent: 'Script' };

    requestContext.run(store, () => {
      expect(auditEvent('user-id', 'sign_in_failed', { reason: 'password' })).toEqual({
        userId: 'user-id',
        actorId: 'user-id',
        action: 'sign_in_failed',
        data: { reason: 'password', ...network },
      });
      expect(auditEvent('user-id', 'webhook_deleted', { webhookId: 'hook' }).data).toEqual({ webhookId: 'hook' });
    });
    expect(auditEvent('user-id', 'sign_in_failed', { reason: 'password' }).data).toEqual({ reason: 'password' });
    expect(auditEvent(null, 'account_deleted', { userId: 'gone' })).toMatchObject({ userId: null, actorId: null });
  });
});
