import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretBox } from '../src/crypto/secret-box.service';
import { GoogleAuthService } from '../src/google/google-auth.service';
import { googleScopes, type GoogleGrant } from '../src/google/google-client';

const device = { hash: 'device', label: 'Firefox on Windows' };
const box = new SecretBox(new ConfigService({ DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }));

function setup() {
  const prisma = {
    googleAccount: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    googleCalendar: { deleteMany: vi.fn() },
    item: { updateMany: vi.fn() },
    user: { count: vi.fn().mockResolvedValue(0), findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
  };
  const google = {
    enabled: true,
    authorizeUrl: vi.fn((input: { state: string; challenge: string }) => `https://accounts.google.com/auth?state=${input.state}&challenge=${input.challenge}`),
    exchange: vi.fn(),
    forget: vi.fn(),
    revoke: vi.fn(),
  };
  const auth = {
    signInWithGoogle: vi.fn().mockResolvedValue({ session: { accessToken: 'access', refreshToken: 'refresh', user: {} } }),
    registerWithGoogle: vi.fn().mockResolvedValue({ id: 'new-user', email: 'sam@example.com' }),
  };
  const audit = { record: vi.fn() };
  const service = new GoogleAuthService(prisma as never, google as never, box, auth as never, audit as never);
  return { prisma, google, auth, audit, service };
}

function grant(overrides: Partial<GoogleGrant['identity']> = {}, scopes: string[] = [...googleScopes.identity], refreshToken: string | null = null): GoogleGrant {
  return { identity: { subject: 'google-sub', email: 'sam@example.com', emailVerified: true, name: 'Sam', nonce: null, ...overrides }, scopes, refreshToken };
}

function started(context: ReturnType<typeof setup>, ...args: Parameters<GoogleAuthService['begin']>) {
  const { flow } = context.service.begin(...args);
  const { state, nonce } = JSON.parse(box.open(flow)) as { state: string; nonce: string };
  return { flow, state, nonce };
}

describe('GoogleAuthService', () => {
  let context: ReturnType<typeof setup>;

  beforeEach(() => {
    context = setup();
  });

  it('starts a PKCE flow whose state only this browser can finish', async () => {
    const { flow, state, nonce } = started(context, 'sign-in');
    const [request] = context.google.authorizeUrl.mock.calls[0]!;

    expect(request).toMatchObject({ state, nonce, offline: false, scopes: [...googleScopes.identity] });
    expect(request.challenge).toMatch(/^[\w-]{43}$/);
    await expect(context.service.finish(undefined, { code: 'code', state }, device)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(context.service.finish(flow, { code: 'code', state: 'forged' }, device)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(context.service.finish('v1:garbled', { code: 'code', state }, device)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(context.google.exchange).not.toHaveBeenCalled();
  });

  it('rejects a Google answer that was minted for another sign-in', async () => {
    const { flow, state } = started(context, 'sign-in');
    context.google.exchange.mockResolvedValue(grant({ nonce: 'someone-elses' }));

    await expect(context.service.finish(flow, { code: 'code', state }, device)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(context.auth.signInWithGoogle).not.toHaveBeenCalled();
  });

  it('signs in the Strata account already linked to this Google account', async () => {
    const { flow, state, nonce } = started(context, 'sign-in');
    context.google.exchange.mockResolvedValue(grant({ nonce }));
    context.prisma.googleAccount.findUnique.mockResolvedValue({ userId: 'user-1', email: 'sam@example.com' });

    await expect(context.service.finish(flow, { code: 'code', state }, device)).resolves.toMatchObject({ session: { accessToken: 'access' } });
    expect(context.auth.signInWithGoogle).toHaveBeenCalledWith('user-1', device);
    expect(context.auth.registerWithGoogle).not.toHaveBeenCalled();
  });

  it('never links a Google account to an existing Strata account by email alone', async () => {
    const { flow, state, nonce } = started(context, 'sign-in');
    context.google.exchange.mockResolvedValue(grant({ nonce }));
    context.prisma.user.count.mockResolvedValue(1);

    await expect(context.service.finish(flow, { code: 'code', state }, device)).rejects.toBeInstanceOf(ConflictException);
    expect(context.auth.registerWithGoogle).not.toHaveBeenCalled();
    expect(context.auth.signInWithGoogle).not.toHaveBeenCalled();
  });

  it('creates an account for a new verified Google address, redeeming the invite it came with', async () => {
    const invite = 'i'.repeat(43);
    const { flow, state, nonce } = started(context, 'sign-in', { invite });
    context.google.exchange.mockResolvedValue(grant({ nonce }));

    await context.service.finish(flow, { code: 'code', state }, device);
    expect(context.auth.registerWithGoogle).toHaveBeenCalledWith({ email: 'sam@example.com', displayName: 'Sam', subject: 'google-sub', invite });
    expect(context.audit.record).toHaveBeenCalledWith('new-user', 'google_linked', { email: 'sam@example.com' });
    expect(context.auth.signInWithGoogle).toHaveBeenCalledWith('new-user', device);
  });

  it('refuses to create an account from an address Google has not verified', async () => {
    const { flow, state, nonce } = started(context, 'sign-in');
    context.google.exchange.mockResolvedValue(grant({ nonce, emailVerified: false }));

    await expect(context.service.finish(flow, { code: 'code', state }, device)).rejects.toBeInstanceOf(ForbiddenException);
    expect(context.auth.registerWithGoogle).not.toHaveBeenCalled();
  });

  it('needs calendar access to connect Google Calendar', async () => {
    const { flow, state, nonce } = started(context, 'calendar', { userId: 'user-1' });
    context.google.exchange.mockResolvedValue(grant({ nonce }, [...googleScopes.identity], 'refresh'));

    await expect(context.service.finish(flow, { code: 'code', state }, device)).rejects.toBeInstanceOf(ForbiddenException);
    expect(context.prisma.googleAccount.upsert).not.toHaveBeenCalled();
  });

  it('refuses a Google account that another Strata account already linked', async () => {
    const { flow, state, nonce } = started(context, 'link', { userId: 'user-1' });
    context.google.exchange.mockResolvedValue(grant({ nonce }));
    context.prisma.googleAccount.findUnique.mockResolvedValueOnce({ userId: 'user-2' });

    await expect(context.service.finish(flow, { code: 'code', state }, device)).rejects.toBeInstanceOf(ConflictException);
    expect(context.prisma.googleAccount.upsert).not.toHaveBeenCalled();
  });

  it('keeps the calendar grant with a sealed refresh token and returns to the page that asked', async () => {
    const scopes = [...googleScopes.identity, ...googleScopes.calendar];
    const { flow, state, nonce } = started(context, 'calendar', { userId: 'user-1', returnTo: '/agenda/calendars' });
    context.google.exchange.mockResolvedValue(grant({ nonce }, scopes, 'refresh-token'));

    await expect(context.service.finish(flow, { code: 'code', state }, device)).resolves.toEqual({ connected: 'calendar', returnTo: '/agenda/calendars' });
    const [{ create }] = context.prisma.googleAccount.upsert.mock.calls[0]!;
    expect(create).toMatchObject({ userId: 'user-1', subject: 'google-sub', scopes });
    expect(box.open(create.refreshTokenSealed)).toBe('refresh-token');
    expect(context.google.authorizeUrl.mock.calls[0]![0]).toMatchObject({ offline: true });
  });

  it('unlinks only accounts that can still sign in with a password', async () => {
    context.prisma.user.findUniqueOrThrow.mockResolvedValue({ passwordHash: null, googleAccount: { email: 'sam@example.com' } });
    await expect(context.service.unlink('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(context.google.revoke).not.toHaveBeenCalled();

    context.prisma.user.findUniqueOrThrow.mockResolvedValue({ passwordHash: 'scrypt$hash', googleAccount: { email: 'sam@example.com' } });
    await context.service.unlink('user-1');
    expect(context.google.revoke).toHaveBeenCalledWith('user-1');
    expect(context.prisma.$transaction).toHaveBeenCalled();
    expect(context.audit.record).toHaveBeenCalledWith('user-1', 'google_unlinked', { email: 'sam@example.com' });
  });
});
