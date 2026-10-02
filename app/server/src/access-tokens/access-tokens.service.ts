import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { linkTokenHash } from '../crypto/link-token';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessTokenDto } from './dto/access-tokens.dto';
import { tokenPrefix } from './scopes';

const dayMs = 24 * 60 * 60 * 1000;
const maxActiveTokens = 20;

const tokenFields = {
  id: true,
  name: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AccessTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string) {
    return this.prisma.accessToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: tokenFields,
    });
  }

  async create(userId: string, input: CreateAccessTokenDto) {
    await this.auth.reauthenticate(userId, input);
    if ((await this.list(userId)).length >= maxActiveTokens) {
      throw new ConflictException(`You can have ${maxActiveTokens} tokens at once. Revoke one you no longer use.`);
    }
    const token = `${tokenPrefix}${randomBytes(32).toString('base64url')}`;
    const created = await this.prisma.accessToken.create({
      data: {
        userId,
        name: input.name,
        tokenHash: linkTokenHash(token),
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + (input.expiresInDays ?? 90) * dayMs),
      },
      select: tokenFields,
    });
    await this.audit.record(userId, 'access_token_created', { name: input.name });
    return { ...created, token };
  }

  async revoke(userId: string, tokenId: string) {
    const token = await this.prisma.accessToken.findFirst({
      where: { id: tokenId, userId, revokedAt: null },
      select: { name: true },
    });
    const revoked = await this.prisma.accessToken.updateMany({
      where: { id: tokenId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!token || revoked.count === 0) {
      throw new NotFoundException('That token is already revoked');
    }
    await this.audit.record(userId, 'access_token_revoked', { name: token.name });
  }
}
