import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/config/environment';

const settings = {
  DATABASE_URL: 'postgresql://strata@localhost/strata',
  AUTH_ACCESS_TOKEN_SECRET: 'local-access-token-secret-change-me-please',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:4104',
  DATA_ENCRYPTION_KEY: Buffer.from('local-development-key-change-me!').toString('base64'),
  APP_URL: 'http://localhost:4104',
  DEFAULT_FROM_EMAIL: 'Strata <strata@example.com>',
};
const production = { NODE_ENV: 'production', REDIS_URL: 'redis://redis:6379' };
const realSecret = randomBytes(32).toString('base64url');
const realKey = randomBytes(32).toString('base64');

describe('validateEnvironment', () => {
  it('accepts the development defaults outside production', () => {
    expect(() => validateEnvironment({ ...settings, NODE_ENV: 'development' })).not.toThrow();
  });

  it('treats a blank optional setting as unset', () => {
    expect(() => validateEnvironment({ ...settings, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, VAPID_SUBJECT: 'not-an-address' })).toThrow('VAPID_SUBJECT');
  });

  it('accepts a proxy hop count from 0 to 5 and nothing else', () => {
    expect(() => validateEnvironment({ ...settings, TRUST_PROXY: '0' })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, TRUST_PROXY: '1' })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, TRUST_PROXY: '6' })).toThrow('TRUST_PROXY');
    expect(() => validateEnvironment({ ...settings, TRUST_PROXY: 'true' })).toThrow('TRUST_PROXY');
  });

  it('refuses to start in production with a development secret or key', () => {
    expect(() => validateEnvironment({ ...settings, ...production, DATA_ENCRYPTION_KEY: realKey })).toThrow('development defaults');
    expect(() => validateEnvironment({ ...settings, ...production, AUTH_ACCESS_TOKEN_SECRET: realSecret })).toThrow('development defaults');
    expect(() => validateEnvironment({ ...settings, ...production, AUTH_ACCESS_TOKEN_SECRET: realSecret, DATA_ENCRYPTION_KEY: realKey })).not.toThrow();
  });

  it('needs a Redis address in production and takes none elsewhere', () => {
    const secrets = { AUTH_ACCESS_TOKEN_SECRET: realSecret, DATA_ENCRYPTION_KEY: realKey };
    expect(() => validateEnvironment({ ...settings, ...secrets, NODE_ENV: 'production' })).toThrow('REDIS_URL');
    expect(() => validateEnvironment({ ...settings, ...secrets, NODE_ENV: 'production', REDIS_URL: '' })).toThrow('REDIS_URL');
    expect(() => validateEnvironment({ ...settings, NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateEnvironment(settings)).not.toThrow();
    expect(() => validateEnvironment({ ...settings, REDIS_URL: 'http://redis:6379' })).toThrow('REDIS_URL');
  });

  it('takes an optional https Sentry address', () => {
    expect(() => validateEnvironment({ ...settings, SENTRY_DSN: 'https://public-key@o123.ingest.sentry.io/456' })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, SENTRY_DSN: '' })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, SENTRY_DSN: 'http://public-key@o123.ingest.sentry.io/456' })).toThrow('SENTRY_DSN');
    expect(() => validateEnvironment({ ...settings, SENTRY_DSN: 'not-an-address' })).toThrow('SENTRY_DSN');
  });

  it('takes an optional metrics token of at least 32 characters', () => {
    expect(() => validateEnvironment({ ...settings, METRICS_TOKEN: realSecret })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, METRICS_TOKEN: '' })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, METRICS_TOKEN: 'too-short' })).toThrow('METRICS_TOKEN');
  });

  it('accepts only an absolute files directory', () => {
    expect(() => validateEnvironment({ ...settings, FILES_ROOT: resolve('files') })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, FILES_ROOT: '' })).not.toThrow();
    expect(() => validateEnvironment({ ...settings, FILES_ROOT: 'data/files' })).toThrow('FILES_ROOT');
  });
});
