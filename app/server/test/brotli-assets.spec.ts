import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brotliAssets } from '../src/http/brotli-assets';

@Module({})
class EmptyModule {}

describe('precompressed frontend assets', () => {
  const source = `export const greeting = ${JSON.stringify('hello '.repeat(400))};`;
  let app: NestExpressApplication;
  let root: string;
  let base: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'strata-assets-'));
    writeFileSync(join(root, 'app.js'), source);
    writeFileSync(join(root, 'app.js.br'), brotliCompressSync(source));
    writeFileSync(join(root, 'plain.js'), source);
    app = await NestFactory.create<NestExpressApplication>(EmptyModule, { logger: false });
    app.use(compression());
    app.use('/assets', brotliAssets(root));
    app.useStaticAssets(root, { prefix: '/assets', immutable: true, maxAge: '1y' });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/assets`;
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves the brotli file built next to an asset when the browser accepts brotli', async () => {
    const response = await fetch(`${base}/app.js`, { headers: { 'Accept-Encoding': 'br, gzip' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('vary')).toContain('Accept-Encoding');
    expect(await response.text()).toBe(source);
  });

  it('leaves the asset to on-the-fly compression when the browser does not accept brotli', async () => {
    const response = await fetch(`${base}/app.js`, { headers: { 'Accept-Encoding': 'gzip' } });

    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(await response.text()).toBe(source);
  });

  it('compresses assets that have no brotli file on the fly', async () => {
    const response = await fetch(`${base}/plain.js`, { headers: { 'Accept-Encoding': 'br' } });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(source);
  });
});
