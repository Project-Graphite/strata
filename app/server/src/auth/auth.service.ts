import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, TokenPurpose, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Device } from './device';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TwoStepService } from './two-step.service';

export const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const refreshReuseGraceMs = 30 * 1000;
const challengeLifetimeMs = 5 * 60 * 1000;
const challengeAttempts = 5;
const tokenLifetimesMs: Record<TokenPurpose, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  CHANGE_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

const accountTokens = [TokenPurpose.CHANGE_EMAIL, TokenPurpose.RESET_PASSWORD];

export interface Proof {
  password: string;
  code?: string;
}

interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  role: UserRole;
  timeZone: string;
}

function uniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function handleTaken() {
  return new ConflictException('That handle is taken');
}

function emailUnavailable() {
  return new ServiceUnavailableException('The email could not be sent. Try again later.');
}

@Injectable()
export class AuthService {
  private unknownAccountHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    private readonly twoStep: TwoStepService,
  ) {}

  async register(input: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      await this.mail.trySend({
        to: existing.email,
        subject: 'Someone tried to create a Strata account with your email',
        text: [
          `Hi ${existing.displayName},`,
          '',
          'Someone tried to create a new Strata account with this email address, which already has one. Nothing was changed.',
          '',
          'If it was you, sign in instead, or reset your password if you have forgotten it:',
          '',
          this.mail.link('/forgot-password'),
        ].join('\n'),
      });
      return { registered: true };
    }
    if (await this.prisma.user.findUnique({ where: { handle: input.handle }, select: { id: true } })) {
      throw handleTaken();
    }
    await this.passwords.assertNotBreached(input.password);
    const passwordHash = await this.passwords.hash(input.password);
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.create({
            data: {
              email: input.email,
              handle: input.handle,
              displayName: input.displayName,
              passwordHash,
            },
            select: { id: true, email: true, displayName: true },
          });
          if (
            !(await this.sendVerification(transaction, user, TokenPurpose.VERIFY_EMAIL, user.email))
          ) {
            throw emailUnavailable();
          }
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
      if (await this.prisma.user.findUnique({ where: { handle: input.handle }, select: { id: true } })) {
        throw handleTaken();
      }
    }
    return { registered: true };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.verifiedAt && user.isActive) {
      await this.sendVerification(this.prisma, user, TokenPurpose.VERIFY_EMAIL, user.email);
    }
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: this.digest(token) },
    });
    if (
      !record ||
      record.purpose === TokenPurpose.RESET_PASSWORD ||
      record.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Verification token is invalid or expired');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: record.userId },
          data: { verifiedAt: new Date(), ...(record.email ? { email: record.email } : {}) },
        }),
        this.prisma.verificationToken.deleteMany({
          where: {
            userId: record.userId,
            purpose: { in: record.email ? accountTokens : [record.purpose] },
          },
        }),
      ]);
    } catch (error) {
      if (uniqueViolation(error)) {
        throw new ConflictException('Another account already uses that email address');
      }
      throw error;
    }
    return { verified: true };
  }

  async login(input: LoginDto, device: Device) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      this.unknownAccountHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
      await this.passwords.verify(input.password, await this.unknownAccountHash);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    if (!(await this.passwords.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    if (!user.verifiedAt) {
      throw new UnauthorizedException('Verify your email before signing in');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }
    if (await this.twoStep.enabled(user.id)) {
      const challenge = randomBytes(32).toString('hex');
      await this.prisma.signInChallenge.create({
        data: {
          userId: user.id,
          tokenHash: this.digest(challenge),
          expiresAt: new Date(Date.now() + challengeLifetimeMs),
        },
      });
      return { challenge };
    }
    return { session: await this.issueSession(user, device, { alertNewDevice: true }) };
  }

  async completeTwoStep(challenge: string, code: string, device: Device) {
    const record = await this.prisma.signInChallenge.findUnique({
      where: { tokenHash: this.digest(challenge) },
      include: { user: true },
    });
    if (!record || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('This sign-in has expired. Sign in again.');
    }
    const counted = await this.prisma.signInChallenge.updateMany({
      where: { id: record.id, attempts: { lt: challengeAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      await this.prisma.signInChallenge.deleteMany({ where: { id: record.id } });
      throw new UnauthorizedException('Too many wrong codes. Sign in again.');
    }
    if (!(await this.twoStep.verify(record.userId, code))) {
      throw new UnauthorizedException('That code is not right');
    }
    const consumed = await this.prisma.signInChallenge.deleteMany({ where: { id: record.id } });
    if (consumed.count === 0 || !record.user.isActive) {
      throw new UnauthorizedException('This sign-in has expired. Sign in again.');
    }
    return this.issueSession(record.user, device, { alertNewDevice: true });
  }

  async refresh(rawToken: string) {
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.digest(rawToken) },
      include: { user: true },
    });
    if (!session) {
      throw new UnauthorizedException('Refresh session is invalid');
    }
    const now = new Date();
    const rotated =
      !session.revokedAt &&
      session.expiresAt > now &&
      (
        await this.prisma.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now },
        })
      ).count === 1;
    if (!rotated) {
      if (
        session.revokedAt &&
        now.getTime() - session.revokedAt.getTime() > refreshReuseGraceMs
      ) {
        await this.prisma.refreshSession.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      throw new UnauthorizedException('Refresh session is invalid');
    }
    if (!session.user.isActive || !session.user.verifiedAt) {
      throw new UnauthorizedException('Refresh session is invalid');
    }
    return this.issueSession(
      session.user,
      { hash: session.deviceHash, label: session.deviceLabel },
      { signedInAt: session.signedInAt },
    );
  }

  async logout(rawToken: string | undefined) {
    if (rawToken) {
      await this.prisma.refreshSession.deleteMany({ where: { tokenHash: this.digest(rawToken) } });
    }
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) {
      return;
    }
    const token = await this.createToken(this.prisma, user.id, TokenPurpose.RESET_PASSWORD);
    await this.mail.trySend({
      to: user.email,
      subject: 'Reset your Strata password',
      text: [
        `Hi ${user.displayName},`,
        '',
        'Someone asked to reset the password of your Strata account. Choose a new one with this link within the next hour:',
        '',
        this.mail.link(`/reset-password?token=${token}`),
        '',
        'If that was not you, ignore this email and your password stays the same.',
      ].join('\n'),
    });
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: this.digest(token) },
      include: { user: { select: { verifiedAt: true, email: true, displayName: true } } },
    });
    if (
      !record ||
      record.purpose !== TokenPurpose.RESET_PASSWORD ||
      record.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Reset link is invalid or expired');
    }
    await this.passwords.assertNotBreached(password);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await this.passwords.hash(password),
          verifiedAt: record.user.verifiedAt ?? now,
        },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { userId: record.userId, purpose: { in: accountTokens } },
      }),
      this.prisma.refreshSession.deleteMany({ where: { userId: record.userId } }),
    ]);
    await this.passwordChangedNotice(record.user);
  }

  async changePassword(userId: string, proof: Proof, newPassword: string, device: Device) {
    const user = await this.reauthenticate(userId, proof);
    await this.passwords.assertNotBreached(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await this.passwords.hash(newPassword) },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { userId, purpose: { in: accountTokens } },
      }),
      this.prisma.refreshSession.deleteMany({ where: { userId } }),
    ]);
    await this.passwordChangedNotice(user);
    return this.issueSession(user, device, {});
  }

  async requestEmailChange(userId: string, email: string, proof: Proof) {
    const user = await this.reauthenticate(userId, proof);
    if (email === user.email) {
      throw new BadRequestException('This is already your email address');
    }
    const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!taken && !(await this.sendVerification(this.prisma, user, TokenPurpose.CHANGE_EMAIL, email))) {
      throw emailUnavailable();
    }
    await this.mail.trySend({
      to: user.email,
      subject: 'Your Strata email is being changed',
      text: [
        `Hi ${user.displayName},`,
        '',
        'Someone asked to move your Strata account to another email address. Nothing changes until that address is confirmed.',
        '',
        'If this was not you, reset your password now. That cancels the change:',
        '',
        this.mail.link('/forgot-password'),
      ].join('\n'),
    });
  }

  async deleteAccount(userId: string, proof: Proof) {
    await this.reauthenticate(userId, proof);
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async reauthenticate(userId: string, proof: Proof) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(proof.password, user.passwordHash))) {
      throw new ForbiddenException('Current password is incorrect');
    }
    if (await this.twoStep.enabled(userId)) {
      if (!proof.code) {
        throw new ForbiddenException('Enter a code from your authenticator app or a recovery code');
      }
      if (!(await this.twoStep.verify(userId, proof.code))) {
        throw new ForbiddenException('That code is not right');
      }
    }
    return user;
  }

  private async issueSession(
    user: SessionUser,
    device: { hash: string | null; label: string },
    options: { alertNewDevice?: boolean; signedInAt?: Date },
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.digest(refreshToken),
        deviceHash: device.hash,
        deviceLabel: device.label,
        signedInAt: options.signedInAt,
        expiresAt: new Date(Date.now() + refreshLifetimeMs),
      },
      select: { id: true },
    });
    if (options.alertNewDevice && device.hash) {
      await this.rememberDevice(user, device.hash, device.label);
    }
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id },
      {
        secret: this.config.getOrThrow<string>('AUTH_ACCESS_TOKEN_SECRET'),
        expiresIn: 15 * 60,
      },
    );
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        handle: user.handle,
        displayName: user.displayName,
        role: user.role.toLowerCase(),
        timeZone: user.timeZone,
      },
    };
  }

  private async rememberDevice(user: SessionUser, hash: string, label: string) {
    const known = await this.prisma.knownDevice.count({ where: { userId: user.id } });
    const added = await this.prisma.knownDevice.createMany({
      data: [{ userId: user.id, deviceHash: hash }],
      skipDuplicates: true,
    });
    if (added.count === 1 && known > 0) {
      await this.mail.trySend({
        to: user.email,
        subject: 'New sign-in to your Strata account',
        text: [
          `Hi ${user.displayName},`,
          '',
          `Your Strata account was just signed in to from a new device: ${label}, at ${new Date().toUTCString()}.`,
          '',
          'If this was you, there is nothing to do. If not, reset your password now, then sign out the devices you do not recognise:',
          '',
          this.mail.link('/forgot-password'),
          this.mail.link('/settings/sessions'),
        ].join('\n'),
      });
    }
  }

  private passwordChangedNotice(user: { email: string; displayName: string }) {
    return this.mail.trySend({
      to: user.email,
      subject: 'Your Strata password was changed',
      text: [
        `Hi ${user.displayName},`,
        '',
        'The password of your Strata account was just changed, and every device was signed out.',
        '',
        'If this was not you, reset it again now:',
        '',
        this.mail.link('/forgot-password'),
      ].join('\n'),
    });
  }

  private async sendVerification(
    client: Prisma.TransactionClient,
    user: { id: string; displayName: string },
    purpose: typeof TokenPurpose.VERIFY_EMAIL | typeof TokenPurpose.CHANGE_EMAIL,
    to: string,
  ) {
    const changing = purpose === TokenPurpose.CHANGE_EMAIL;
    const token = await this.createToken(client, user.id, purpose, changing ? to : null);
    return this.mail.trySend({
      to,
      subject: changing
        ? 'Confirm your new Strata email'
        : 'Verify your Strata email',
      text: [
        `Hi ${user.displayName},`,
        '',
        changing
          ? 'Confirm this address to use it for your Strata account:'
          : 'Confirm this address to finish creating your Strata account:',
        '',
        this.mail.link(`/verify?token=${token}`),
        '',
        'The link works for 24 hours. If you did not ask for this, ignore this email.',
      ].join('\n'),
    });
  }

  private async createToken(
    client: Prisma.TransactionClient,
    userId: string,
    purpose: TokenPurpose,
    email: string | null = null,
  ) {
    const token = randomBytes(32).toString('hex');
    await client.verificationToken.deleteMany({ where: { userId, purpose } });
    await client.verificationToken.create({
      data: {
        userId,
        purpose,
        email,
        tokenHash: this.digest(token),
        expiresAt: new Date(Date.now() + tokenLifetimesMs[purpose]),
      },
    });
    return token;
  }

  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
