import {
  ConflictException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenPurpose } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { MailDeliveryError, MailService } from '../src/mail/mail.service';
import { UpdateProfileDto } from '../src/users/dto/users.dto';

const sendMail = vi.fn();
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

function passwordHash(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

const user = {
  id: 'user-id',
  email: 'reader@example.com',
  handle: 'reader',
  displayName: 'Reader',
  passwordHash: passwordHash('correct horse battery'),
  verifiedAt: new Date(),
  isActive: true,
  role: 'MEMBER',
  timeZone: 'Etc/UTC',
};

function setup(overrides: Record<string, object> = {}) {
  const prisma = {
    user: {
      create: vi.fn().mockResolvedValue(user),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockReturnValue('user-update'),
      delete: vi.fn(),
    },
    verificationToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockReturnValue('token-delete'),
      create: vi.fn(),
    },
    refreshSession: {
      create: vi.fn(),
      updateMany: vi.fn().mockReturnValue('session-revoke'),
    },
    $transaction: vi.fn((work: unknown) =>
      typeof work === 'function' ? (work as (client: unknown) => unknown)(prisma) : work,
    ),
    ...overrides,
  };
  const mail = { send: vi.fn(), link: (path: string) => `https://strata.example${path}` };
  const service = new AuthService(
    prisma as never,
    new JwtService(),
    new ConfigService({ AUTH_ACCESS_TOKEN_SECRET: 'test-secret' }),
    mail as never,
  );
  return { mail, prisma, service };
}

function sentToken(mail: { send: ReturnType<typeof vi.fn> }, to?: string) {
  const [message] = (
    to ? mail.send.mock.calls.find(([sent]) => (sent as { to: string }).to === to) : mail.send.mock.calls.at(-1)
  ) as [{ text: string }];
  return /token=([0-9a-f]{64})/.exec(message.text)?.[1] ?? '';
}

const refusedRecipient = () =>
  new MailDeliveryError({
    code: 'EENVELOPE',
    responseCode: 550,
    command: 'RCPT TO',
    message: `Recipient command failed: 550 5.1.1 <${user.email}>: Recipient address rejected`,
  });

describe('Account email flows', () => {
  it('sends the verification link inside the registration transaction and never returns it', async () => {
    const { mail, prisma, service } = setup();

    const result = await service.register({
      email: user.email,
      handle: user.handle,
      displayName: user.displayName,
      password: 'correct horse battery',
    });

    expect(result).toEqual({ registered: true });
    expect(JSON.stringify(result)).not.toContain(sentToken(mail));
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email, text: expect.stringContaining('https://strata.example/verify?token=') }),
    );
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: TokenPurpose.VERIFY_EMAIL,
        email: null,
        tokenHash: digest(sentToken(mail)),
      }),
    });
  });

  it('answers a sign-up for a registered email exactly like a new one and tells the owner instead', async () => {
    const { mail, prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(user);

    const result = await service.register({
      email: user.email,
      handle: 'someone-else',
      displayName: 'Someone',
      password: 'another long password',
    });

    expect(result).toEqual({ registered: true });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email, text: expect.stringContaining('https://strata.example/forgot-password') }),
    );
    expect(sentToken(mail)).toBe('');
  });

  it('refuses a handle that is already taken', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'someone-else' });

    await expect(
      service.register({
        email: 'new@example.com',
        handle: user.handle,
        displayName: 'New',
        password: 'another long password',
      }),
    ).rejects.toThrow(new ConflictException('That handle is taken'));
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('fails registration when the verification email cannot be sent', async () => {
    const { mail, service } = setup();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mail.send.mockRejectedValue(new ServiceUnavailableException('Email delivery is not configured'));

    await expect(
      service.register({
        email: user.email,
        handle: user.handle,
        displayName: user.displayName,
        password: 'correct horse battery',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    warn.mockRestore();
  });

  it('applies a confirmed email change, cancels reset links to the old address and refuses reset links as verification', async () => {
    const { prisma, service } = setup();
    prisma.verificationToken.findUnique.mockResolvedValueOnce({
      userId: user.id,
      purpose: TokenPurpose.CHANGE_EMAIL,
      email: 'new@example.com',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.verifyEmail('a'.repeat(64));

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { verifiedAt: expect.any(Date), email: 'new@example.com' },
    });
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        purpose: { in: [TokenPurpose.CHANGE_EMAIL, TokenPurpose.RESET_PASSWORD] },
      },
    });

    prisma.verificationToken.findUnique.mockResolvedValueOnce({
      userId: user.id,
      purpose: TokenPurpose.RESET_PASSWORD,
      email: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.verifyEmail('b'.repeat(64))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('removes only verification links when a new account confirms its address', async () => {
    const { prisma, service } = setup();
    prisma.verificationToken.findUnique.mockResolvedValueOnce({
      userId: user.id,
      purpose: TokenPurpose.VERIFY_EMAIL,
      email: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.verifyEmail('e'.repeat(64));

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id, purpose: { in: [TokenPurpose.VERIFY_EMAIL] } },
    });
  });

  it('answers a reset request the same way when the email cannot be sent, without logging the address', async () => {
    const { mail, prisma, service } = setup();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.user.findUnique.mockResolvedValueOnce(user);
    mail.send.mockRejectedValueOnce(refusedRecipient());

    await expect(service.requestPasswordReset(user.email)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SMTP 550'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(user.email);
    warn.mockRestore();
  });

  it('sends reset links only to existing active accounts and says nothing either way', async () => {
    const { mail, prisma, service } = setup();

    await expect(service.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();

    prisma.user.findUnique.mockResolvedValueOnce(user);
    await expect(service.requestPasswordReset(user.email)).resolves.toBeUndefined();
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email, text: expect.stringContaining('/reset-password?token=') }),
    );
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: TokenPurpose.RESET_PASSWORD }),
    });
  });

  it('resets the password, confirms the address, cancels pending email changes and signs every device out', async () => {
    const { prisma, service } = setup();
    prisma.verificationToken.findUnique.mockResolvedValueOnce({
      userId: user.id,
      purpose: TokenPurpose.RESET_PASSWORD,
      email: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { verifiedAt: null },
    });

    await service.resetPassword('c'.repeat(64), 'a brand new password');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        passwordHash: expect.stringMatching(/^scrypt\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/),
        verifiedAt: expect.any(Date),
      },
    });
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        purpose: { in: [TokenPurpose.CHANGE_EMAIL, TokenPurpose.RESET_PASSWORD] },
      },
    });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    prisma.verificationToken.findUnique.mockResolvedValueOnce({
      userId: user.id,
      purpose: TokenPurpose.VERIFY_EMAIL,
      expiresAt: new Date(Date.now() + 60_000),
      user: { verifiedAt: null },
    });
    await expect(service.resetPassword('d'.repeat(64), 'a brand new password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('requires the current password to change the password, email or delete the account', async () => {
    const { mail, prisma, service } = setup();

    await expect(service.changePassword(user.id, 'wrong', 'a brand new password')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.requestEmailChange(user.id, 'new@example.com', 'wrong')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.deleteAccount(user.id, 'wrong')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();

    const session = await service.changePassword(user.id, 'correct horse battery', 'a brand new password');
    expect(session.user.id).toBe(user.id);
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        purpose: { in: [TokenPurpose.CHANGE_EMAIL, TokenPurpose.RESET_PASSWORD] },
      },
    });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);

    await service.deleteAccount(user.id, 'correct horse battery');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: user.id } });
  });

  it('never reveals whether another account uses the new address, and warns the old one', async () => {
    const { mail, prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'someone-else' });

    await expect(
      service.requestEmailChange(user.id, 'taken@example.com', 'correct horse battery'),
    ).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'taken@example.com' }));
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: user.email }));
  });

  it('sends an email change confirmation to the new address and warns the old one', async () => {
    const { mail, prisma, service } = setup();

    await service.requestEmailChange(user.id, 'new@example.com', 'correct horse battery');
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@example.com' }));
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: TokenPurpose.CHANGE_EMAIL,
        email: 'new@example.com',
        tokenHash: digest(sentToken(mail, 'new@example.com')),
      }),
    });
    const [[warning]] = mail.send.mock.calls.filter(([sent]) => (sent as { to: string }).to === user.email) as [
      [{ text: string }],
    ];
    expect(warning.text).toContain('https://strata.example/forgot-password');
    expect(warning.text).not.toContain('new@example.com');
    expect(warning.text).not.toMatch(/token=/);
  });

  it('refuses an email change when the confirmation cannot be sent', async () => {
    const { mail, service } = setup();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mail.send.mockRejectedValueOnce(refusedRecipient());

    await expect(
      service.requestEmailChange(user.id, 'new@example.com', 'correct horse battery'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mail.send).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('accepts IANA time zones only', async () => {
    const errors = async (timeZone: unknown) =>
      (await validate(plainToInstance(UpdateProfileDto, { timeZone }))).map(({ property }) => property);

    await expect(errors('Africa/Cairo')).resolves.toEqual([]);
    await expect(errors('Mars/Olympus_Mons')).resolves.toEqual(['timeZone']);
    await expect(errors(null)).resolves.toEqual(['timeZone']);
  });
});

describe('MailService', () => {
  it('refuses to send until SMTP is configured', async () => {
    await expect(
      new MailService(new ConfigService({})).send({ to: user.email, subject: 'Hi', text: 'Hi' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sends from the configured sender and links to the public origin', async () => {
    const mail = new MailService(
      new ConfigService({
        APP_URL: 'https://strata.example',
        EMAIL_HOST: 'smtp.example',
        DEFAULT_FROM_EMAIL: 'Strata <strata@example.com>',
      }),
    );

    await mail.send({ to: user.email, subject: 'Hi', text: 'Hi' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Strata <strata@example.com>',
      to: user.email,
      subject: 'Hi',
      text: 'Hi',
    });
    expect(mail.link('/verify?token=abc')).toBe('https://strata.example/verify?token=abc');
  });

  it('reports SMTP failures by code, status and command without the server response', async () => {
    const mail = new MailService(
      new ConfigService({ EMAIL_HOST: 'smtp.example', DEFAULT_FROM_EMAIL: 'strata@example.com' }),
    );
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error(`Recipient command failed: 550 <${user.email}> rejected`), {
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
        response: `550 <${user.email}> rejected`,
      }),
    );

    const error = await mail.send({ to: user.email, subject: 'Hi', text: 'Hi' }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error).toMatchObject({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
    expect((error as Error).message).toBe('Email delivery failed (EENVELOPE, SMTP 550, RCPT TO)');
    expect(JSON.stringify(error)).not.toContain(user.email);
  });
});
