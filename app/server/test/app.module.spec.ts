import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settings = {
  DATABASE_URL: 'postgresql://strata:strata@localhost:5432/strata',
  AUTH_ACCESS_TOKEN_SECRET: 'test-access-secret-that-is-long-enough',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:4104',
  APP_URL: 'http://localhost:4104',
  DEFAULT_FROM_EMAIL: 'Strata <strata@example.com>',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

async function compile() {
  vi.resetModules();
  const { AppModule } = await import('../src/app.module');
  return { AppModule, application: await Test.createTestingModule({ imports: [AppModule] }).compile() };
}

describe('AppModule', () => {
  beforeEach(() => {
    Object.assign(process.env, settings);
  });

  afterEach(() => {
    for (const name of Object.keys(settings)) delete process.env[name];
  });

  it('resolves the complete dependency graph', async () => {
    const { AppModule, application } = await compile();

    expect(application.get(AppModule)).toBeInstanceOf(AppModule);
    await application.close();
  });

  it('refuses to start when a required setting is missing', async () => {
    delete process.env.AUTH_ACCESS_TOKEN_SECRET;

    await expect(compile()).rejects.toThrow('Missing or invalid settings: AUTH_ACCESS_TOKEN_SECRET');
  });
});
