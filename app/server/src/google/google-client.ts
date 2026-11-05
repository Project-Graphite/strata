import { BadGatewayException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretBox } from '../crypto/secret-box.service';
import { PrismaService } from '../prisma/prisma.service';

export const googleScopes = {
  identity: ['openid', 'email', 'profile'],
  calendar: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'],
  drive: ['https://www.googleapis.com/auth/drive.file'],
} as const;

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  nonce: string | null;
}

export interface GoogleGrant {
  identity: GoogleIdentity;
  refreshToken: string | null;
  scopes: string[];
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class GoogleDisconnectedError extends Error {
  constructor() {
    super('Google access was removed. Connect Google again.');
  }
}

export function googleHttpError(error: unknown, notFound: string): never {
  if (error instanceof GoogleDisconnectedError) throw new ForbiddenException(error.message);
  if (error instanceof GoogleApiError) {
    if (error.status === 404) throw new NotFoundException(notFound);
    if (error.status === 401 || error.status === 403) throw new ForbiddenException('Google refused access. Connect Google again.');
    throw new BadGatewayException('Google could not be reached. Try again in a moment.');
  }
  throw error;
}

const issuers = ['https://accounts.google.com', 'accounts.google.com'];
const tokenEndpoint = 'https://oauth2.googleapis.com/token';

function claims(idToken: string) {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('Google sent an unreadable sign-in token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

@Injectable()
export class GoogleClient {
  private readonly logger = new Logger(GoogleClient.name);
  private readonly accessTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly box: SecretBox,
  ) {}

  get enabled() {
    return Boolean(this.config.get<string>('GOOGLE_CLIENT_ID'));
  }

  get picker() {
    const apiKey = this.config.get<string>('GOOGLE_API_KEY');
    const appId = this.config.get<string>('GOOGLE_APP_ID');
    return this.enabled && apiKey && appId ? { apiKey, appId } : null;
  }

  get redirectUri() {
    return new URL('/google/callback', this.config.getOrThrow<string>('APP_URL')).toString();
  }

  authorizeUrl(input: { scopes: readonly string[]; state: string; nonce: string; challenge: string; offline: boolean; loginHint?: string }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: input.scopes.join(' '),
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.challenge,
      code_challenge_method: 'S256',
      include_granted_scopes: 'true',
      ...(input.offline ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'select_account' }),
      ...(input.loginHint ? { login_hint: input.loginHint } : {}),
    }).toString();
    return url.toString();
  }

  async exchange(code: string, verifier: string): Promise<GoogleGrant> {
    const body = await this.token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: this.redirectUri });
    const payload = claims(String(body.id_token ?? ''));
    if (!issuers.includes(String(payload.iss)) || payload.aud !== this.clientId() || Number(payload.exp) * 1000 < Date.now() || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new Error('Google sent a sign-in token for another app or one that expired');
    }
    return {
      identity: {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
        name: typeof payload.name === 'string' ? payload.name : null,
        nonce: typeof payload.nonce === 'string' ? payload.nonce : null,
      },
      refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
      scopes: String(body.scope ?? '').split(' ').filter(Boolean),
    };
  }

  async accessToken(userId: string) {
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const account = await this.prisma.googleAccount.findUnique({ where: { userId }, select: { refreshTokenSealed: true } });
    if (!account?.refreshTokenSealed) throw new GoogleDisconnectedError();
    let body: Record<string, unknown>;
    try {
      body = await this.token({ grant_type: 'refresh_token', refresh_token: this.box.open(account.refreshTokenSealed) });
    } catch (error) {
      if (error instanceof GoogleApiError && error.message === 'invalid_grant') {
        await this.prisma.googleAccount.updateMany({ where: { userId }, data: { refreshTokenSealed: null, scopes: [...googleScopes.identity] } });
        this.forget(userId);
        throw new GoogleDisconnectedError();
      }
      throw error;
    }
    const token = String(body.access_token);
    this.accessTokens.set(userId, { token, expiresAt: Date.now() + Number(body.expires_in ?? 0) * 1000 });
    return token;
  }

  async request<T>(userId: string, url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.send(userId, url, init);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async download(userId: string, url: string, maxBytes: number) {
    const response = await this.send(userId, url, {});
    const length = Number(response.headers.get('content-length'));
    if (length > maxBytes) throw new GoogleApiError('too-large', 413);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) throw new GoogleApiError('too-large', 413);
    return data;
  }

  async revoke(userId: string) {
    const account = await this.prisma.googleAccount.findUnique({ where: { userId }, select: { refreshTokenSealed: true } });
    this.forget(userId);
    if (!account?.refreshTokenSealed) return;
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(this.box.open(account.refreshTokenSealed))}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    }).catch((error: Error) => error);
    if (response instanceof Error || !response.ok) {
      this.logger.warn(`Google did not confirm revoking access for ${userId}: ${response instanceof Error ? response.message : `HTTP ${response.status}`}`);
    }
  }

  forget(userId: string) {
    this.accessTokens.delete(userId);
  }

  private async send(userId: string, url: string, init: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken(userId)}`, ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (response.status === 401) this.forget(userId);
      throw new GoogleApiError(body?.error?.message ?? `Google answered with HTTP ${response.status}`, response.status);
    }
    return response;
  }

  private async token(fields: Record<string, string>) {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId(), client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'), ...fields }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new GoogleApiError(String(body.error ?? `HTTP ${response.status}`), response.status);
    return body;
  }

  private clientId() {
    return this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
  }
}
