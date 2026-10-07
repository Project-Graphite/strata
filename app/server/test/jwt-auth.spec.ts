import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Scope } from '../src/access-tokens/scopes';
import { TokenAuthenticator } from '../src/access-tokens/token-authenticator';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { CurrentUser } from '../src/auth/current-user.decorator';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

const secret = 'test-access-secret';

@Controller('probe')
@UseGuards(JwtAuthGuard)
class ProbeController {
  @Get()
  probe(@CurrentUser() viewer: AuthenticatedUser) {
    return { viewer };
  }

  @Get('items')
  @Scope('items:read')
  items(@CurrentUser() viewer: AuthenticatedUser) {
    return { viewer };
  }

  @Get('write')
  @Scope('items:write')
  write() {
    return {};
  }
}

describe('JwtAuthGuard', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({})],
      controllers: [ProbeController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        { provide: ConfigService, useValue: new ConfigService({ AUTH_ACCESS_TOKEN_SECRET: secret }) },
        {
          provide: TokenAuthenticator,
          useValue: {
            authenticate: vi.fn((raw: string) =>
              Promise.resolve(
                raw === `strata_pat_${'k'.repeat(43)}`
                  ? { id: 'reader-id', sessionId: null, isAdmin: false, isSystemManager: false, scopes: ['items:read'] }
                  : null,
              ),
            ),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            refreshSession: {
              findUnique: vi.fn(({ where }: { where: { id: string } }) =>
                Promise.resolve(
                  where.id === 'live-session'
                    ? { userId: 'admin-id', revokedAt: null, user: { isActive: true, role: 'ADMIN' } }
                    : { userId: 'admin-id', revokedAt: new Date(), user: { isActive: true, role: 'ADMIN' } },
                ),
              ),
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/probe`;
  });

  afterAll(() => app.close());

  it('refuses anonymous requests, recognises a signed-in member, and refuses forged tokens and ended sessions', async () => {
    const token = await new JwtService().signAsync({ sub: 'admin-id', sid: 'live-session' }, { secret, expiresIn: 60 });
    const signedOut = await new JwtService().signAsync({ sub: 'admin-id', sid: 'ended-session' }, { secret, expiresIn: 60 });
    const call = (authorization?: string) =>
      fetch(base, { headers: authorization ? { Authorization: authorization } : {} });

    expect((await call()).status).toBe(401);

    const signedIn = await call(`Bearer ${token}`);
    await expect(signedIn.json()).resolves.toEqual({
      viewer: { id: 'admin-id', sessionId: 'live-session', isAdmin: true, isSystemManager: false, scopes: null },
    });

    expect((await call(`Bearer ${signedOut}`)).status).toBe(401);

    expect((await call('Bearer not-a-token')).status).toBe(401);

    const otherAlgorithm = await new JwtService().signAsync({ sub: 'admin-id', sid: 'live-session' }, { secret, expiresIn: 60, algorithm: 'HS512' });
    expect((await call(`Bearer ${otherAlgorithm}`)).status).toBe(401);
  });

  it('lets an access token reach only endpoints marked with a scope it holds', async () => {
    const call = (path: string, token: string) =>
      fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const token = `strata_pat_${'k'.repeat(43)}`;

    const items = await call('/items', token);
    expect(items.status).toBe(200);
    await expect(items.json()).resolves.toEqual({
      viewer: { id: 'reader-id', sessionId: null, isAdmin: false, isSystemManager: false, scopes: ['items:read'] },
    });
    expect((await call('', token)).status).toBe(403);
    expect((await call('/write', token)).status).toBe(403);
    expect((await call('/items', `strata_pat_${'x'.repeat(43)}`)).status).toBe(401);
  });
});
