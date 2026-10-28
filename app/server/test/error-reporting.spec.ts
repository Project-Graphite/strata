import { Controller, Get, INestApplication, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from '../src/http/api-exception.filter';
import { requestLog } from '../src/http/request-log';
import { scrubEvent } from '../src/instrument';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn(), init: vi.fn() }));

@Controller('probe')
class ProbeController {
  @Get('broken')
  broken() {
    throw new Error('stack detail');
  }

  @Get('gone')
  gone() {
    throw new NotFoundException('That note is gone');
  }
}

describe('scrubEvent', () => {
  it('drops cookies, credentials, bodies and query strings from the request', () => {
    const event = scrubEvent({
      type: undefined,
      tags: { requestId: 'request-1', route: '/api/v1/notes/:id' },
      user: { id: 'user-1' },
      request: {
        method: 'POST',
        url: 'https://strata.example.com/api/v1/notes/1?share=secret-link-code',
        query_string: 'share=secret-link-code',
        cookies: { strata_refresh: 'refresh-token' },
        data: { text: 'private note body' },
        env: { REMOTE_ADDR: '203.0.113.9' },
        headers: { Authorization: 'Bearer access-token', cookie: 'strata_refresh=refresh-token', 'user-agent': 'Firefox' },
      },
    });

    expect(event.request).toEqual({ method: 'POST', url: 'https://strata.example.com/api/v1/notes/1', headers: { 'user-agent': 'Firefox' } });
    expect(event.tags).toEqual({ requestId: 'request-1', route: '/api/v1/notes/:id' });
    expect(event.user).toEqual({ id: 'user-1' });
    expect(JSON.stringify(event)).not.toMatch(/secret-link-code|refresh-token|access-token|private note body|203\.0\.113\.9/);
  });

  it('leaves events without a request alone', () => {
    expect(scrubEvent({ type: undefined, message: 'Boom' })).toEqual({ type: undefined, message: 'Boom' });
  });

  it('does not start Sentry without SENTRY_DSN', () => {
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});

describe('Error reporting', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const module = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.use(requestLog);
    app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/probe`;
  });

  afterAll(() => app.close());

  it('reports an unexpected failure once, tagged with the request id and route', async () => {
    const broken = await fetch(`${base}/broken`);

    expect(broken.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'stack detail' }), {
      tags: { requestId: broken.headers.get('x-request-id'), route: '/api/v1/probe/broken' },
      user: undefined,
    });
  });

  it('does not report deliberate errors', async () => {
    vi.mocked(Sentry.captureException).mockClear();

    expect((await fetch(`${base}/gone`)).status).toBe(404);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
