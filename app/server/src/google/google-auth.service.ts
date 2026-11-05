import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { Device } from '../auth/device';
import { SecretBox } from '../crypto/secret-box.service';
import { PrismaService } from '../prisma/prisma.service';
import { forgetCalendars } from './forget-calendars';
import { GoogleClient, googleScopes, type GoogleGrant } from './google-client';

export type GooglePurpose = 'sign-in' | 'link' | 'calendar' | 'drive';

interface Flow {
  state: string;
  verifier: string;
  nonce: string;
  purpose: GooglePurpose;
  userId?: string;
  invite?: string;
  returnTo?: string;
  expiresAt: number;
}

const flowLifetimeMs = 10 * 60 * 1000;
const expired = 'This Google sign-in expired. Start again.';
const purposeScopes: Record<GooglePurpose, readonly string[]> = {
  'sign-in': [],
  link: [],
  calendar: googleScopes.calendar,
  drive: googleScopes.drive,
};

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleClient,
    private readonly box: SecretBox,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  config() {
    return { enabled: this.google.enabled };
  }

  begin(purpose: GooglePurpose, options: { userId?: string; invite?: string; returnTo?: string; loginHint?: string } = {}) {
    if (!this.google.enabled) throw new NotFoundException('Google is not set up on this Strata');
    const { loginHint, ...kept } = options;
    const flow: Flow = {
      state: randomBytes(16).toString('base64url'),
      verifier: randomBytes(32).toString('base64url'),
      nonce: randomBytes(16).toString('base64url'),
      purpose,
      ...kept,
      expiresAt: Date.now() + flowLifetimeMs,
    };
    const offline = purposeScopes[purpose].length > 0;
    return {
      url: this.google.authorizeUrl({
        scopes: [...googleScopes.identity, ...purposeScopes[purpose]],
        state: flow.state,
        nonce: flow.nonce,
        challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
        offline,
        loginHint,
      }),
      flow: this.box.seal(JSON.stringify(flow)),
    };
  }

  async connect(userId: string, purpose: Exclude<GooglePurpose, 'sign-in'>, returnTo?: string) {
    const account = await this.prisma.googleAccount.findUnique({ where: { userId }, select: { email: true } });
    return this.begin(purpose, { userId, returnTo, loginHint: account?.email });
  }

  async finish(sealed: string | undefined, input: { code: string; state: string }, device: Device) {
    const flow = sealed ? this.readFlow(sealed) : undefined;
    if (!flow || flow.state !== input.state || flow.expiresAt < Date.now()) throw new UnauthorizedException(expired);
    const grant = await this.google.exchange(input.code, flow.verifier).catch((error: Error) => {
      this.logger.warn(`Google sign-in could not be confirmed: ${error.message}`);
      throw new BadRequestException('Google could not confirm this sign-in. Try again.');
    });
    if (grant.identity.nonce !== flow.nonce) throw new UnauthorizedException(expired);
    if (flow.purpose === 'sign-in') return this.signIn(grant, flow.invite, device);
    await this.link(flow.userId!, flow.purpose, grant);
    return { connected: flow.purpose, returnTo: flow.returnTo ?? '/settings/security' };
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, googleAccount: { select: { email: true, scopes: true, refreshTokenSealed: true } } },
    });
    const account = user.googleAccount;
    const granted = (scopes: readonly string[]) => Boolean(account?.refreshTokenSealed) && scopes.every((scope) => account!.scopes.includes(scope));
    return {
      available: this.google.enabled,
      picker: this.google.picker,
      hasPassword: Boolean(user.passwordHash),
      account: account && { email: account.email, calendar: granted(googleScopes.calendar), drive: granted(googleScopes.drive) },
    };
  }

  async unlink(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, googleAccount: { select: { email: true } } } });
    if (!user.googleAccount) throw new NotFoundException('No Google account is linked');
    if (!user.passwordHash) throw new ForbiddenException('Set a password before unlinking Google, so you can still sign in.');
    await this.google.revoke(userId);
    await this.prisma.$transaction([...forgetCalendars(this.prisma, { userId }), this.prisma.googleAccount.delete({ where: { userId } })]);
    await this.audit.record(userId, 'google_unlinked', { email: user.googleAccount.email });
  }

  async pickerToken(userId: string) {
    const picker = this.google.picker;
    if (!picker) throw new NotFoundException('Importing from Google Drive is not set up on this Strata');
    if (!(await this.status(userId)).account?.drive) throw new ForbiddenException('Connect Google Drive first');
    return { token: await this.google.accessToken(userId), ...picker };
  }

  private async signIn({ identity }: GoogleGrant, invite: string | undefined, device: Device) {
    const linked = await this.prisma.googleAccount.findUnique({ where: { subject: identity.subject }, select: { userId: true, email: true } });
    if (linked) {
      if (linked.email !== identity.email) await this.prisma.googleAccount.update({ where: { subject: identity.subject }, data: { email: identity.email } });
      return this.auth.signInWithGoogle(linked.userId, device);
    }
    if (!identity.emailVerified) throw new ForbiddenException('Google has not verified this email address, so it cannot be used to sign in.');
    if (await this.prisma.user.count({ where: { email: identity.email } })) {
      throw new ConflictException('A Strata account already uses this email. Sign in with your password, then link Google in Settings → Security.');
    }
    const user = await this.auth.registerWithGoogle({ email: identity.email, displayName: identity.name ?? identity.email.split('@')[0]!, subject: identity.subject, invite });
    await this.audit.record(user.id, 'google_linked', { email: identity.email });
    return this.auth.signInWithGoogle(user.id, device);
  }

  private async link(userId: string, purpose: Exclude<GooglePurpose, 'sign-in'>, grant: GoogleGrant) {
    const { identity } = grant;
    if (purposeScopes[purpose].some((scope) => !grant.scopes.includes(scope))) {
      throw new ForbiddenException(purpose === 'calendar' ? 'Allow Strata to see and edit your Google calendars to sync them.' : 'Allow Strata to open the Drive files you pick to import them.');
    }
    const owner = await this.prisma.googleAccount.findUnique({ where: { subject: identity.subject }, select: { userId: true } });
    if (owner && owner.userId !== userId) throw new ConflictException('This Google account is linked to another Strata account.');
    const current = await this.prisma.googleAccount.findUnique({ where: { userId }, select: { subject: true, email: true } });
    if (current && current.subject !== identity.subject) throw new ConflictException(`Choose the Google account you linked, ${current.email}.`);
    const refreshTokenSealed = grant.refreshToken ? this.box.seal(grant.refreshToken) : undefined;
    await this.prisma.googleAccount.upsert({
      where: { userId },
      create: { userId, subject: identity.subject, email: identity.email, scopes: grant.scopes, refreshTokenSealed },
      update: { email: identity.email, scopes: grant.scopes, refreshTokenSealed },
    });
    this.google.forget(userId);
    if (!current) await this.audit.record(userId, 'google_linked', { email: identity.email });
  }

  private readFlow(sealed: string) {
    try {
      return JSON.parse(this.box.open(sealed)) as Flow;
    } catch {
      return undefined;
    }
  }
}
