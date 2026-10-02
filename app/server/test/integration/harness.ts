import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ItemKind, SpaceRole, UserRole } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, vi } from 'vitest';
import { PasswordService } from '../../src/auth/password.service';
import { ApiExceptionFilter } from '../../src/http/api-exception.filter';
import { MailService, type MailMessage } from '../../src/mail/mail.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const settings = {
  AUTH_ACCESS_TOKEN_SECRET: 'integration-access-secret-long-enough',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:4104',
  APP_URL: 'http://localhost:4104',
  DEFAULT_FROM_EMAIL: 'Strata <strata@example.com>',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
};

export const password = 'integration password that is long';

export interface Reply {
  status: number;
  body: any;
}

type Call = (method: string, path: string, body?: unknown) => Promise<Reply>;

export interface Member {
  id: string;
  email: string;
  handle: string;
  personalSpaceId: string;
  call: Call;
}

export function integrationApp() {
  const run = randomBytes(4).toString('hex');
  const mail: MailMessage[] = [];
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let passwordHash: string;

  function caller(token?: string): Call {
    return async (method, path, body) => {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(
        `${base}${path}`,
        body === undefined
          ? { method, headers }
          : { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };
  }

  beforeAll(async () => {
    Object.assign(process.env, settings);
    vi.spyOn(PasswordService.prototype, 'assertNotBreached').mockResolvedValue();
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        link: (path: string) => new URL(path, settings.APP_URL).toString(),
        trySend(message: MailMessage) {
          mail.push(message);
          return Promise.resolve(true);
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
    app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    prisma = app.get(PrismaService);
    passwordHash = await new PasswordService().hash(password);
  });

  afterAll(async () => {
    const users = { email: { endsWith: `-${run}@example.com` } };
    await prisma.space.deleteMany({ where: { members: { some: { user: users } } } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  return {
    mail,
    anonymous: (method: string, path: string, body?: unknown) => caller()(method, path, body),
    get prisma() {
      return prisma;
    },
    service: <T>(type: abstract new (...args: never[]) => T) => app.get(type),
    email: (name: string) => `${name}-${run}@example.com`,
    handle: (name: string) => `${name}${run}`,

    async member(name: string, role: UserRole = UserRole.MEMBER): Promise<Member> {
      const user = await prisma.user.create({
        data: {
          email: `${name}-${run}@example.com`,
          handle: `${name}${run}`,
          displayName: name,
          passwordHash,
          role,
          verifiedAt: new Date(),
        },
      });
      const space = await prisma.space.create({
        data: {
          name: 'Personal',
          personalOwnerId: user.id,
          createdById: user.id,
          members: { create: { userId: user.id, role: SpaceRole.OWNER } },
        },
      });
      const session = await prisma.refreshSession.create({
        data: { userId: user.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      const token = await new JwtService().signAsync(
        { sub: user.id, sid: session.id },
        { secret: settings.AUTH_ACCESS_TOKEN_SECRET, expiresIn: 3_600 },
      );
      return { id: user.id, email: user.email, handle: user.handle, personalSpaceId: space.id, call: caller(token) };
    },

    item(spaceId: string, title: string, kind: ItemKind = ItemKind.NOTE) {
      return prisma.item.create({ data: { spaceId, kind, title } });
    },

    async join(spaceId: string, user: Member, role: SpaceRole) {
      await prisma.spaceMember.create({ data: { spaceId, userId: user.id, role } });
    },
  };
}
