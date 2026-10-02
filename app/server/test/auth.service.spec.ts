import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';

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

function serviceWith(session: Record<string, unknown> | null, rotated = 1) {
  const refreshSession = {
    findUnique: vi.fn().mockResolvedValue(session && { user, ...session }),
    updateMany: vi.fn().mockResolvedValue({ count: rotated }),
    create: vi.fn().mockResolvedValue({ id: 'new-session-id' }),
  };
  const service = new AuthService(
    { refreshSession } as never,
    new JwtService(),
    new ConfigService({ AUTH_ACCESS_TOKEN_SECRET: 'test-secret' }),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { refreshSession, service };
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

  it('rejects a token rotated moments ago without revoking other sessions', async () => {
    const { refreshSession, service } = serviceWith({
      id: 'session-id',
      userId: 'user-id',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshSession.updateMany).not.toHaveBeenCalled();
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
