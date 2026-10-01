import { Controller, Get, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiExceptionFilter } from '../src/http/api-exception.filter';
import { securityHeaders } from '../src/http/security-headers';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('database detail that must stay private', {
    code,
    clientVersion: 'test',
  });

@Controller('probe')
class ProbeController {
  @Get('missing')
  missing() {
    throw prismaError('P2025');
  }

  @Get('duplicate')
  duplicate() {
    throw prismaError('P2002');
  }

  @Get('broken')
  broken() {
    throw new Error('stack detail that must stay private');
  }

  @Get('gone')
  gone() {
    throw new NotFoundException('That note is gone');
  }
}

describe('HTTP layer', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(securityHeaders);
    app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/probe`;
  });

  afterAll(() => app.close());

  it('sends a strict content security policy and isolation headers with every response', async () => {
    const response = await fetch(`${base}/gone`);
    const policy = response.headers.get('content-security-policy') ?? '';

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('unsafe-inline');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('maps known database errors to plain answers without leaking their detail', async () => {
    const missing = await fetch(`${base}/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain('database detail');

    const duplicate = await fetch(`${base}/duplicate`);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.text()).not.toContain('database detail');
  });

  it('answers unexpected failures with a generic 500 and keeps deliberate errors as they are', async () => {
    const broken = await fetch(`${base}/broken`);
    expect(broken.status).toBe(500);
    expect(await broken.text()).not.toContain('stack detail');

    const gone = await fetch(`${base}/gone`);
    expect(gone.status).toBe(404);
    await expect(gone.json()).resolves.toMatchObject({ message: 'That note is gone' });
  });
});
