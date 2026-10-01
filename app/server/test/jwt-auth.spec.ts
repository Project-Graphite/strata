import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'admin-id',
                isActive: true,
                role: 'ADMIN',
              }),
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

  it('refuses anonymous requests, recognises a signed-in member and refuses a forged token', async () => {
    const token = await new JwtService().signAsync({ sub: 'admin-id' }, { secret, expiresIn: 60 });
    const call = (authorization?: string) =>
      fetch(base, { headers: authorization ? { Authorization: authorization } : {} });

    expect((await call()).status).toBe(401);

    const signedIn = await call(`Bearer ${token}`);
    await expect(signedIn.json()).resolves.toEqual({
      viewer: { id: 'admin-id', isAdmin: true, isSystemManager: false },
    });

    expect((await call('Bearer not-a-token')).status).toBe(401);
  });
});
