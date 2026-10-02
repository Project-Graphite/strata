import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { deviceLabel } from '../src/auth/device';
import { PasswordService } from '../src/auth/password.service';
import { SessionsService } from '../src/auth/sessions.service';
import { totpCode } from '../src/auth/totp';
import { TwoStepService } from '../src/auth/two-step.service';
import { SecretBox } from '../src/crypto/secret-box.service';

const box = new SecretBox(new ConfigService({ DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64') }));
const rfcVector = 'GEZDGNBVGY3TQOJQ'.repeat(2);
const currentCode = () => totpCode(rfcVector, Math.floor(Date.now() / 30_000));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const mail = () => ({ trySend: vi.fn().mockResolvedValue(true), link: (path: string) => `https://strata.example${path}` });
const user = { id: 'user-id', email: 'amr@example.com', displayName: 'Amr', handle: 'amr', role: 'MEMBER', timeZone: 'Etc/UTC' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TwoStepService', () => {
  function setup(credential: object | null) {
    const prisma = {
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue(user) },
      twoStepCredential: {
        findUnique: vi.fn().mockResolvedValue(credential),
        upsert: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn(),
      },
      recoveryCode: {
        count: vi.fn().mockResolvedValue(10),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn((work: unknown) =>
        typeof work === 'function' ? (work as (client: unknown) => unknown)(prisma) : Promise.all(work as unknown[]),
      ),
    };
    const sent = mail();
    return { prisma, mail: sent, service: new TwoStepService(prisma as never, box, sent as never) };
  }

  it('stores a new authenticator secret only in sealed form and returns it once', async () => {
    const { prisma, service } = setup(null);

    const { secret: issued, uri } = await service.setup(user.id);

    const stored = prisma.twoStepCredential.upsert.mock.calls[0]![0].create.secretEncrypted as string;
    expect(stored).not.toContain(issued);
    expect(box.open(stored)).toBe(issued);
    expect(uri).toContain(`secret=${issued}`);
  });

  it('refuses to start again while two-step sign-in is on', async () => {
    const { service } = setup({ confirmedAt: new Date() });
    await expect(service.setup(user.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('turns on only with a correct code and hands out ten recovery codes stored as hashes', async () => {
    const { mail: sent, prisma, service } = setup({ secretEncrypted: box.seal(rfcVector), confirmedAt: null });

    await expect(service.confirm(user.id, '000000')).rejects.toBeInstanceOf(BadRequestException);
    const { recoveryCodes } = await service.confirm(user.id, currentCode());

    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    expect(recoveryCodes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const stored = prisma.recoveryCode.createMany.mock.calls[0]![0].data as Array<{ codeHash: string }>;
    expect(stored.map(({ codeHash }) => codeHash)).toContain(digest(recoveryCodes[0]!.replaceAll('-', '')));
    expect(JSON.stringify(stored)).not.toContain(recoveryCodes[0]!);
    expect(sent.trySend).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Two-step sign-in is on for your Strata account' }));
  });

  it('accepts each authenticator code only once', async () => {
    const { prisma, service } = setup({ secretEncrypted: box.seal(rfcVector), confirmedAt: new Date(), lastUsedStep: 1 });

    await expect(service.verify(user.id, currentCode())).resolves.toBe(true);
    expect(prisma.twoStepCredential.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: expect.any(Number) } }] },
      data: { lastUsedStep: expect.any(Number) },
    });

    prisma.twoStepCredential.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.verify(user.id, currentCode())).resolves.toBe(false);
  });

  it('accepts a recovery code in any case and spacing, once', async () => {
    const { prisma, service } = setup({ secretEncrypted: box.seal(rfcVector), confirmedAt: new Date() });

    await expect(service.verify(user.id, ' ABCD-efgh-2345 ')).resolves.toBe(true);
    expect(prisma.recoveryCode.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, codeHash: digest('abcdefgh2345'), usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    prisma.recoveryCode.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.verify(user.id, 'abcd-efgh-2345')).resolves.toBe(false);
  });

  it('never accepts codes while two-step sign-in is not confirmed', async () => {
    const { service } = setup({ secretEncrypted: box.seal(rfcVector), confirmedAt: null });
    await expect(service.verify(user.id, currentCode())).resolves.toBe(false);
  });
});

describe('AuthService with two-step sign-in', () => {
  async function setup({ enabled, verifies = true }: { enabled: boolean; verifies?: boolean }) {
    const passwords = new PasswordService();
    vi.spyOn(passwords, 'assertNotBreached').mockResolvedValue();
    const passwordHash = await passwords.hash('correct horse battery');
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...user, passwordHash, verifiedAt: new Date(), isActive: true }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...user, passwordHash }),
      },
      signInChallenge: {
        create: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      refreshSession: { create: vi.fn().mockResolvedValue({ id: 'session-id' }) },
      knownDevice: { count: vi.fn().mockResolvedValue(1), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const twoStep = { enabled: vi.fn().mockResolvedValue(enabled), verify: vi.fn().mockResolvedValue(verifies) };
    const sent = mail();
    const service = new AuthService(
      prisma as never,
      new JwtService(),
      new ConfigService({ AUTH_ACCESS_TOKEN_SECRET: 'test-secret' }),
      sent as never,
      passwords,
      twoStep as never,
      { get: vi.fn().mockResolvedValue({ inviteOnly: false }) } as never,
      {} as never,
    );
    return { mail: sent, passwords, prisma, service, twoStep };
  }
  const device = { hash: 'device-hash', label: 'Firefox on Windows' };

  it('asks for a code instead of signing in, and keeps the challenge only as a hash', async () => {
    const { prisma, service } = await setup({ enabled: true });

    const result = await service.login({ email: user.email, password: 'correct horse battery' }, device);

    expect(result).toEqual({ challenge: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
    const challenge = (result as { challenge: string }).challenge;
    expect(prisma.signInChallenge.create).toHaveBeenCalledWith({
      data: { userId: user.id, tokenHash: digest(challenge), expiresAt: expect.any(Date) },
    });
  });

  it('signs in once the code is right and spends the challenge', async () => {
    const { prisma, service } = await setup({ enabled: true });
    prisma.signInChallenge.findUnique.mockResolvedValue({
      id: 'challenge-id',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...user, isActive: true },
    });

    const session = await service.completeTwoStep('c'.repeat(64), '123456', device);

    expect(session.user.id).toBe(user.id);
    expect(prisma.signInChallenge.deleteMany).toHaveBeenCalledWith({ where: { id: 'challenge-id' } });
  });

  it('refuses a wrong code, and ends the challenge after five attempts', async () => {
    const { prisma, service } = await setup({ enabled: true, verifies: false });
    prisma.signInChallenge.findUnique.mockResolvedValue({
      id: 'challenge-id',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...user, isActive: true },
    });

    await expect(service.completeTwoStep('c'.repeat(64), '000000', device)).rejects.toThrow(
      new UnauthorizedException('That code is not right'),
    );
    expect(prisma.signInChallenge.updateMany).toHaveBeenCalledWith({
      where: { id: 'challenge-id', attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });

    prisma.signInChallenge.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.completeTwoStep('c'.repeat(64), '000000', device)).rejects.toThrow('Too many wrong codes');
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
  });

  it('needs the code as well as the password for sensitive changes', async () => {
    const { service, twoStep } = await setup({ enabled: true, verifies: false });

    await expect(service.reauthenticate(user.id, { password: 'correct horse battery' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.reauthenticate(user.id, { password: 'correct horse battery', code: '000000' }),
    ).rejects.toThrow('That code is not right');
    twoStep.verify.mockResolvedValueOnce(true);
    await expect(
      service.reauthenticate(user.id, { password: 'correct horse battery', code: '123456' }),
    ).resolves.toMatchObject({ id: user.id });
  });

  it('emails an alert for a sign-in from a new device, but not for the first device or a known one', async () => {
    const { mail: sent, prisma, service } = await setup({ enabled: false });

    await service.login({ email: user.email, password: 'correct horse battery' }, device);
    expect(sent.trySend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'New sign-in to your Strata account', text: expect.stringContaining('Firefox on Windows') }),
    );

    sent.trySend.mockClear();
    prisma.knownDevice.count.mockResolvedValueOnce(0);
    await service.login({ email: user.email, password: 'correct horse battery' }, device);
    prisma.knownDevice.createMany.mockResolvedValueOnce({ count: 0 });
    await service.login({ email: user.email, password: 'correct horse battery' }, device);
    expect(sent.trySend).not.toHaveBeenCalled();
  });

  it('puts the session id into the access token', async () => {
    const { service } = await setup({ enabled: false });

    const result = await service.login({ email: user.email, password: 'correct horse battery' }, device);

    const token = (result as { session: { accessToken: string } }).session.accessToken;
    expect(new JwtService().decode(token)).toMatchObject({ sub: user.id, sid: 'session-id' });
  });

  it('spends the same password work on an unknown email as on a real one', async () => {
    const { passwords, prisma, service } = await setup({ enabled: false });
    const verify = vi.spyOn(passwords, 'verify');
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.login({ email: 'nobody@example.com', password: 'whatever it is' }, device)).rejects.toThrow(
      'Email or password is incorrect',
    );
    expect(verify).toHaveBeenCalledWith('whatever it is', expect.stringMatching(/^scrypt\$/));
  });
});

describe('PasswordService breach check', () => {
  const pwnedSuffix = (password: string) => createHash('sha1').update(password).digest('hex').toUpperCase().slice(5);

  it('refuses a password found in a breach, sending only the first five hash characters', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(`${pwnedSuffix('password1234')}:42\r\nABCDEF:0`));
    vi.stubGlobal('fetch', fetch);

    await expect(new PasswordService().assertNotBreached('password1234')).rejects.toBeInstanceOf(BadRequestException);
    const url = String(fetch.mock.calls[0]![0]);
    expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
    expect(url).not.toContain('password1234');
  });

  it('accepts a password that is absent or only padding, and does not block when the service is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`${pwnedSuffix('a strong unique phrase')}:0\r\nABCDEF:3`)));
    await expect(new PasswordService().assertNotBreached('a strong unique phrase')).resolves.toBeUndefined();

    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(new PasswordService().assertNotBreached('a strong unique phrase')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Sessions', () => {
  it('lists live sessions with the current one marked', async () => {
    const prisma = {
      refreshSession: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'here', deviceLabel: 'Firefox on Windows' },
          { id: 'phone', deviceLabel: 'Safari on iOS' },
        ]),
      },
    };

    const sessions = await new SessionsService(prisma as never).list(user.id, 'here');

    expect(sessions.map(({ id, current }) => [id, current])).toEqual([
      ['here', true],
      ['phone', false],
    ]);
  });

  it('ends only the signed-in member’s own sessions', async () => {
    const prisma = { refreshSession: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } };

    await expect(new SessionsService(prisma as never).revoke(user.id, 'someone-elses')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.refreshSession.deleteMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses', userId: user.id, revokedAt: null },
    });
  });
});

describe('deviceLabel', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 'Chrome on Android'],
    [undefined, 'Unknown device'],
  ])('names %s', (agent, label) => {
    expect(deviceLabel(agent)).toBe(label);
  });
});
