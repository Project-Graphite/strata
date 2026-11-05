import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { PasswordService } from '../src/auth/password.service';

const user = {
  id: 'user-id',
  email: 'reader@example.com',
  handle: 'reader',
  displayName: 'Reader',
  isActive: true,
  role: 'MEMBER',
  verifiedAt: new Date(),
  timeZone: 'Etc/UTC',
};

function serviceWith(session: Record<string, unknown> | null, rotated = 1, emailedWithinHour = 0) {
  const refreshSession = {
    findUnique: vi.fn().mockResolvedValue(session && { user, ...session }),
    updateMany: vi.fn().mockResolvedValue({ count: rotated }),
    create: vi.fn().mockResolvedValue({ id: 'new-session-id' }),
  };
  const auditEvent = { count: vi.fn().mockResolvedValue(emailedWithinHour) };
  const mail = { trySend: vi.fn().mockResolvedValue(true), link: (path: string) => `https://strata.test${path}` };
  const audit = { record: vi.fn() };
  const service = new AuthService(
    { refreshSession, auditEvent } as never,
    new JwtService(),
    new ConfigService({ AUTH_ACCESS_TOKEN_SECRET: 'test-secret' }),
    mail as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
    {} as never,
  );
  return { refreshSession, auditEvent, mail, audit, service };
}

describe('AuthService refresh', () => {
  it('rotates a valid refresh session', async () => {
    const { refreshSession, service } = serviceWith({
      id: 'session-id',
      userId: 'user-id',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const session = await service.refresh('raw-token');

    expect(session.user.id).toBe('user-id');
    expect(refreshSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(refreshSession.create).toHaveBeenCalledTimes(1);
  });

  it('never lets a refreshed session outlive 30 days from signing in', async () => {
    const signedInAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const { refreshSession, service } = serviceWith({
      id: 'session-id',
      userId: 'user-id',
      signedInAt,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.refresh('raw-token');

    expect(refreshSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signedInAt, expiresAt: new Date(signedInAt.getTime() + 30 * 24 * 60 * 60 * 1000) }),
      }),
    );
  });

  it('revokes every session when a rotated token is replayed', async () => {
    const { refreshSession, service } = serviceWith({
      id: 'session-id',
      userId: 'user-id',
      revokedAt: new Date(Date.now() - 5 * 60_000),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(refreshSession.create).not.toHaveBeenCalled();
  });

  it('records a replayed token and emails the owner at most once an hour', async () => {
    const replayed = {
      id: 'session-id',
      userId: 'user-id',
      deviceLabel: 'Firefox on Linux',
      revokedAt: new Date(Date.now() - 5 * 60_000),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const first = serviceWith(replayed);

    await expect(first.service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(first.auditEvent.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        action: 'refresh_token_reused',
        createdAt: { gt: expect.any(Date) },
        data: { path: ['emailed'], equals: true },
      },
    });
    const since: Date = first.auditEvent.count.mock.calls[0]![0].where.createdAt.gt;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(60 * 60_000 - 1_000);
    expect(Date.now() - since.getTime()).toBeLessThanOrEqual(60 * 60_000 + 1_000);
    expect(first.mail.trySend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'reader@example.com', subject: 'Someone may have your session', text: expect.stringContaining('Firefox on Linux') }),
    );
    expect(first.audit.record).toHaveBeenCalledWith('user-id', 'refresh_token_reused', { device: 'Firefox on Linux', emailed: true });

    const again = serviceWith(replayed, 1, 1);
    await expect(again.service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(again.mail.trySend).not.toHaveBeenCalled();
    expect(again.audit.record).toHaveBeenCalledWith('user-id', 'refresh_token_reused', { device: 'Firefox on Linux', emailed: false });
  });

  it('rejects a token rotated moments ago without revoking other sessions', async () => {
    const { refreshSession, audit, mail, service } = serviceWith({
      id: 'session-id',
      userId: 'user-id',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshSession.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(mail.trySend).not.toHaveBeenCalled();
  });

  it('refuses a device that was signed out without signing out the others', async () => {
    const { refreshSession, service } = serviceWith(null);

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('issues one session when two refreshes race for the same token', async () => {
    const { refreshSession, service } = serviceWith(
      {
        id: 'session-id',
        userId: 'user-id',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      0,
    );

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshSession.create).not.toHaveBeenCalled();
  });
});

function googleOnlyService(site = { inviteOnly: false }) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ ...user, passwordHash: null }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...user, passwordHash: null }),
      findMany: vi.fn().mockResolvedValue([{ handle: 'reader' }]),
    },
    $transaction: vi.fn(),
  };
  const attempts = { assertAllowed: vi.fn(), failed: vi.fn(), clear: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new AuthService(
    prisma as never,
    new JwtService(),
    new ConfigService({ AUTH_ACCESS_TOKEN_SECRET: 'test-secret' }),
    {} as never,
    new PasswordService(),
    {} as never,
    { get: vi.fn().mockResolvedValue(site) } as never,
    {} as never,
    audit as never,
    attempts as never,
    {} as never,
  );
  return { prisma, attempts, audit, service };
}

describe('AuthService for accounts that sign in with Google', () => {
  it('rejects any password for an account without one, like a wrong password', async () => {
    const { attempts, audit, service } = googleOnlyService();

    await expect(service.login({ login: user.email, password: 'anything at all' }, { hash: 'device', label: 'Firefox' })).rejects.toThrow('Email or password is incorrect');
    expect(attempts.failed).toHaveBeenCalledWith(user.email, undefined);
    expect(audit.record).toHaveBeenCalledWith(user.id, 'sign_in_failed', expect.objectContaining({ reason: 'password' }));
  });

  it('asks for a password to be set before confirming sensitive changes', async () => {
    const { attempts, service } = googleOnlyService();

    await expect(service.reauthenticate(user.id, { password: '' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(attempts.assertAllowed).not.toHaveBeenCalled();
  });

  it('creates accounts with Google only with an invite while Strata is invite-only, choosing a free handle', async () => {
    const { prisma, service } = googleOnlyService({ inviteOnly: true });

    await expect(service.registerWithGoogle({ email: 'reader@example.com', displayName: 'Reader', subject: 'sub' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    const created = vi.fn().mockResolvedValue({ id: 'new-user', email: 'reader@example.com' });
    prisma.$transaction.mockImplementation((work: (client: unknown) => unknown) => work({ user: { create: created } }));
    const invitations = { redeemOnSignUp: vi.fn() };
    Object.assign(service, { invitations });
    await service.registerWithGoogle({ email: 'reader@example.com', displayName: 'Reader', subject: 'sub', invite: 'i'.repeat(43) });
    const [{ data }] = created.mock.calls[0]!;
    expect(data).toMatchObject({ email: 'reader@example.com', verifiedAt: expect.any(Date), googleAccount: { create: { subject: 'sub', email: 'reader@example.com' } } });
    expect(data.handle).toMatch(/^reader\d{1,4}$/);
    expect(data).not.toHaveProperty('passwordHash');
    expect(invitations.redeemOnSignUp).toHaveBeenCalledWith(expect.anything(), 'i'.repeat(43), { id: 'new-user', email: 'reader@example.com' });
  });
});