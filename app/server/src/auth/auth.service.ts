import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, SpaceRole, TokenPurpose, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService, auditEvent } from '../audit/audit.service';
import { requestContext } from '../http/request-context';
import { InvitationsService } from '../invitations/invitations.service';
import { JobsService } from '../jobs/jobs.service';
import { MailService } from '../mail/mail.service';
import { emailChangeRequestedEmail, existingAccountEmail, newDeviceEmail, passwordChangedEmail, passwordResetEmail, sessionReusedEmail, verifyEmail } from '../mail/templates';
import { uniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingsService } from '../site/site-settings.service';
import type { Device } from './device';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { SignInAttemptsService } from './sign-in-attempts.service';
import { TwoStepService } from './two-step.service';

export const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;
export const signInLifetimeMs = 30 * 24 * 60 * 60 * 1000;
export const refreshReuseGraceMs = 30 * 1000;
const reuseAlertIntervalMs = 60 * 60 * 1000;
const challengeLifetimeMs = 5 * 60 * 1000;
const challengeAttempts = 5;
const tokenLifetimesMs: Record<TokenPurpose, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  CHANGE_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

const accountTokens = [TokenPurpose.CHANGE_EMAIL, TokenPurpose.RESET_PASSWORD];
const passwordResetKind = 'password-reset-email';
const verificationKind = 'verification-email';

export interface Proof {
  password: string;
  code?: string;
}

interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  avatarId: string | null;
  role: UserRole;
  timeZone: string;
  timeFormat: string;
  features: string[];
  appOrder: string[];
  taskComposer: string;
}

function handleTaken() {
  return new ConflictException('That handle is taken');
}

function emailUnavailable() {
  return new ServiceUnavailableException('The email could not be sent. Try again later.');
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private unknownAccountHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    private readonly twoStep: TwoStepService,
    private readonly site: SiteSettingsService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
    private readonly attempts: SignInAttemptsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.handle(passwordResetKind, (payload) => this.sendPasswordReset((payload as { email: string }).email));
    this.jobs.handle(verificationKind, (payload) => this.sendVerificationAgain((payload as { email: string }).email));
  }

  async register(input: RegisterDto) {
    if (!input.invite && (await this.site.get()).inviteOnly) {
      throw new ForbiddenException('Strata is invite-only right now. Ask someone who uses it for an invite.');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      await this.mail.trySend({ to: existing.email, ...existingAccountEmail(this.mail.link, { name: existing.displayName }) });
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
          if (input.invite) {
            await this.invitations.redeemOnSignUp(transaction, input.invite, user);
          }
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
    await this.jobs.schedule(verificationKind, new Date(), { email });
    void this.jobs.runDue();
  }

  async sendVerificationAgain(email: string) {
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
      throw new UnauthorizedException('This link has expired or was already used.');
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
    if (record.email) {
      await this.audit.record(record.userId, 'email_changed');
    }
    return { verified: true };
  }

  async login(input: LoginDto, device: Device) {
    const identifier = input.login ?? input.email!;
    const user = await this.prisma.user.findUnique({
      where: identifier.includes('@') ? { email: identifier } : { handle: identifier },
    });
    const account = user?.email ?? identifier;
    await this.attempts.assertAllowed(account, device.address);
    if (!user) {
      this.unknownAccountHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
      await this.passwords.verify(input.password, await this.unknownAccountHash);
      await this.attempts.failed(account, device.address);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    if (!(await this.passwords.verify(input.password, user.passwordHash))) {
      await this.audit.record(user.id, 'sign_in_failed', { reason: 'password', device: device.label });
      await this.attempts.failed(account, device.address);
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
    await this.attempts.clear(account);
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
    await this.attempts.assertAllowed(record.user.email, device.address);
    const counted = await this.prisma.signInChallenge.updateMany({
      where: { id: record.id, attempts: { lt: challengeAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      await this.prisma.signInChallenge.deleteMany({ where: { id: record.id } });
      throw new UnauthorizedException('Too many wrong codes. Sign in again.');
    }
    if (!(await this.twoStep.verify(record.userId, code))) {
      await this.audit.record(record.userId, 'sign_in_failed', { reason: 'code', device: device.label });
      await this.attempts.failed(record.user.email, device.address);
      throw new UnauthorizedException('That code is not right');
    }
    const consumed = await this.prisma.signInChallenge.deleteMany({ where: { id: record.id } });
    if (consumed.count === 0 || !record.user.isActive) {
      throw new UnauthorizedException('This sign-in has expired. Sign in again.');
    }
    await this.attempts.clear(record.user.email);
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
        await this.refreshReused(session, now);
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
    await this.jobs.schedule(passwordResetKind, new Date(), { email });
    void this.jobs.runDue();
  }

  async sendPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) {
      return;
    }
    const token = await this.createToken(this.prisma, user.id, TokenPurpose.RESET_PASSWORD);
    await this.mail.trySend({ to: user.email, ...passwordResetEmail(this.mail.link, { name: user.displayName, token }) });
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
      throw new UnauthorizedException('This reset link has expired or was already used.');
    }
    await this.passwords.assertNotBreached(password);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await this.passwords.hash(password),
          verifiedAt: record.user.verifiedAt ?? now,
          calendarFeedHash: null,
        },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { userId: record.userId, purpose: { in: accountTokens } },
      }),
      this.prisma.refreshSession.deleteMany({ where: { userId: record.userId } }),
      this.prisma.accessToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.webhook.updateMany({ where: { userId: record.userId, active: true }, data: { active: false } }),
    ]);
    await this.attempts.clear(record.user.email);
    await this.audit.record(record.userId, 'password_reset');
    await this.passwordChangedNotice(record.user);
  }

  async changePassword(userId: string, proof: Proof, newPassword: string, device: Device) {
    const user = await this.reauthenticate(userId, proof);
    await this.passwords.assertNotBreached(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await this.passwords.hash(newPassword), calendarFeedHash: null },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { userId, purpose: { in: accountTokens } },
      }),
      this.prisma.refreshSession.deleteMany({ where: { userId } }),
      this.prisma.accessToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.webhook.updateMany({ where: { userId, active: true }, data: { active: false } }),
    ]);
    await this.audit.record(userId, 'password_changed');
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
    await this.audit.record(userId, 'email_change_requested');
    await this.mail.trySend({ to: user.email, ...emailChangeRequestedEmail(this.mail.link, { name: user.displayName }) });
  }

  async deleteAccount(userId: string, proof: Proof) {
    const owned = await this.prisma.space.findMany({
      where: { members: { some: { userId, role: SpaceRole.OWNER } } },
      select: {
        id: true,
        name: true,
        members: { where: { userId: { not: userId } }, select: { role: true } },
      },
    });
    const stranded = owned.filter(
      (space) =>
        space.members.length > 0 && !space.members.some((member) => member.role === SpaceRole.OWNER),
    );
    if (stranded.length > 0) {
      throw new ConflictException(
        `Make someone else an owner of ${stranded.map((space) => `"${space.name}"`).join(', ')} first, or delete ${stranded.length === 1 ? 'it' : 'them'}`,
      );
    }
    await this.reauthenticate(userId, proof);
    const revokedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.space.deleteMany({
        where: { id: { in: owned.filter((space) => space.members.length === 0).map((space) => space.id) } },
      }),
      this.prisma.shareLink.updateMany({ where: { createdById: userId, revokedAt: null }, data: { revokedAt } }),
      this.prisma.invitation.updateMany({ where: { inviterId: userId, revokedAt: null }, data: { revokedAt } }),
      this.prisma.user.delete({ where: { id: userId } }),
      this.prisma.auditEvent.create({ data: auditEvent(null, 'account_deleted', { userId }) }),
    ]);
  }

  async reauthenticate(userId: string, proof: Proof) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.attempts.assertAllowed(user.email);
    if (!(await this.passwords.verify(proof.password, user.passwordHash))) {
      await this.reauthenticationFailed(user, 'password');
      throw new ForbiddenException('Current password is incorrect');
    }
    if (await this.twoStep.enabled(userId)) {
      if (!proof.code) {
        throw new ForbiddenException('Enter a code from your authenticator app or a recovery code');
      }
      if (!(await this.twoStep.verify(userId, proof.code))) {
        await this.reauthenticationFailed(user, 'code');
        throw new ForbiddenException('That code is not right');
      }
    }
    return user;
  }

  private async reauthenticationFailed(user: { id: string; email: string }, reason: 'password' | 'code') {
    await this.audit.record(user.id, 'sign_in_failed', { reason, confirming: true });
    await this.attempts.failed(user.email);
  }

  private async refreshReused(
    session: { id: string; userId: string; deviceLabel: string; user: { email: string; displayName: string } },
    now: Date,
  ) {
    this.logger.warn({ requestId: requestContext.getStore()?.requestId, userId: session.userId, sessionId: session.id, message: 'A rotated refresh token was used again; every session was signed out' });
    const alerted = await this.prisma.auditEvent.count({
      where: {
        userId: session.userId,
        action: 'refresh_token_reused',
        createdAt: { gt: new Date(now.getTime() - reuseAlertIntervalMs) },
        data: { path: ['emailed'], equals: true },
      },
    });
    const emailed =
      alerted === 0 &&
      (await this.mail.trySend({ to: session.user.email, ...sessionReusedEmail(this.mail.link, { name: session.user.displayName, device: session.deviceLabel, at: now }) }));
    await this.audit.record(session.userId, 'refresh_token_reused', { device: session.deviceLabel, emailed });
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
        expiresAt: new Date(Math.min(Date.now() + refreshLifetimeMs, (options.signedInAt?.getTime() ?? Date.now()) + signInLifetimeMs)),
      },
      select: { id: true },
    });
    if (options.alertNewDevice) {
      await this.audit.record(user.id, 'signed_in', { device: device.label });
      if (device.hash) await this.rememberDevice(user, device.hash, device.label);
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
        avatarId: user.avatarId,
        role: user.role.toLowerCase(),
        timeZone: user.timeZone,
        timeFormat: user.timeFormat,
        features: user.features,
        appOrder: user.appOrder,
        taskComposer: user.taskComposer,
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
      await this.mail.trySend({ to: user.email, ...newDeviceEmail(this.mail.link, { name: user.displayName, device: label, at: new Date() }) });
    }
  }

  private passwordChangedNotice(user: { email: string; displayName: string }) {
    return this.mail.trySend({ to: user.email, ...passwordChangedEmail(this.mail.link, { name: user.displayName }) });
  }

  private async sendVerification(
    client: Prisma.TransactionClient,
    user: { id: string; displayName: string },
    purpose: typeof TokenPurpose.VERIFY_EMAIL | typeof TokenPurpose.CHANGE_EMAIL,
    to: string,
  ) {
    const changing = purpose === TokenPurpose.CHANGE_EMAIL;
    const token = await this.createToken(client, user.id, purpose, changing ? to : null);
    return this.mail.trySend({ to, ...verifyEmail(this.mail.link, { name: user.displayName, token, changing }) });
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
