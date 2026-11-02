import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { TokenAuthenticator } from '../src/access-tokens/token-authenticator';
import { CaptureMessageDto } from '../src/spending/dto/capture.dto';
import { CaptureService } from '../src/spending/capture/capture.service';

const home = '11111111-1111-4111-8111-111111111111';

function phoneCapture({ reauthenticate = vi.fn(() => Promise.resolve({})) } = {}) {
  const prisma = {
    accessToken: {
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      create: vi.fn(() => Promise.resolve({})),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const auth = { reauthenticate };
  const service = new CaptureService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, auth as never, audit as never);
  return { service, prisma, audit, auth };
}

const stampErrors = async (value: object) =>
  (await validate(plainToInstance(CaptureMessageDto, { from: 'CIB', text: 'Card charged EGP 10', ...value }))).map((error) => error.property);

describe('Phone capture tokens', () => {
  it('mints a 90-day capture token only after re-authentication, replacing the last phone, and audits it', async () => {
    const { service, prisma, audit, auth } = phoneCapture();
    const before = Date.now();
    const result = await service.connectDevice('user', { password: 'secret', code: '123456' });

    expect(auth.reauthenticate).toHaveBeenCalledWith('user', { password: 'secret', code: '123456' });
    expect(result.token).toMatch(/^strata_pat_/);
    expect(result.expiresAt.getTime() - before).toBeGreaterThanOrEqual(90 * 86_400_000);
    expect(result.expiresAt.getTime() - before).toBeLessThan(90 * 86_400_000 + 60_000);
    expect(prisma.accessToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user', revokedAt: null, OR: [{ scopes: { equals: ['spending:capture'] } }, { name: { startsWith: 'Android phone' } }] },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.accessToken.create).toHaveBeenCalledWith({
      data: { userId: 'user', name: 'Android phone', tokenHash: expect.any(String), scopes: ['spending:capture'], expiresAt: result.expiresAt },
    });
    expect(audit.record.mock.calls).toEqual([
      ['user', 'capture_device_revoked', { name: 'Android phone' }],
      ['user', 'capture_device_connected', { name: 'Android phone' }],
    ]);
  });

  it('mints nothing when the password or code is wrong', async () => {
    const { service, prisma, audit } = phoneCapture({ reauthenticate: vi.fn(() => Promise.reject(new ForbiddenException('That code is not right'))) });

    await expect(service.connectDevice('user', { password: 'secret', code: '000000' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.accessToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.accessToken.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('carries the bound space of a token into the signed-in user', async () => {
    const prisma = {
      accessToken: {
        findUnique: vi.fn(() => Promise.resolve({ id: 'token', userId: 'user', spaceId: home, scopes: ['spending:capture'], revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { isActive: true } })),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
    };

    expect(await new TokenAuthenticator(prisma as never).authenticate('strata_pat_x')).toMatchObject({ id: 'user', scopes: ['spending:capture'], tokenSpaceId: home });
  });

  it('rejects empty, zero and too-short message times instead of storing 1970', async () => {
    expect(await stampErrors({ receivedStamp: '' })).toEqual(['receivedStamp']);
    expect(await stampErrors({ receivedStamp: 0 })).toEqual(['receivedStamp']);
    expect(await stampErrors({ sentStamp: '' })).toEqual(['sentStamp']);
    expect(await stampErrors({ sentStamp: '000001791971990' })).toEqual(['sentStamp']);
    expect(await stampErrors({ sentStamp: 1791971990000, receivedStamp: '1791972000000' })).toEqual([]);
    expect(await stampErrors({})).toEqual([]);
  });
});
