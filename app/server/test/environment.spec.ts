import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
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

  it('refuses to start in production with a development secret or key', () => {
    expect(() => validateEnvironment({ ...settings, NODE_ENV: 'production', DATA_ENCRYPTION_KEY: realKey })).toThrow('development defaults');
    expect(() => validateEnvironment({ ...settings, NODE_ENV: 'production', AUTH_ACCESS_TOKEN_SECRET: realSecret })).toThrow('development defaults');
    expect(() => validateEnvironment({ ...settings, NODE_ENV: 'production', AUTH_ACCESS_TOKEN_SECRET: realSecret, DATA_ENCRYPTION_KEY: realKey })).not.toThrow();
  });
});
