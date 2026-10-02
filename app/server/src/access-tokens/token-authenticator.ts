import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { linkTokenHash } from '../crypto/link-token';
import { PrismaService } from '../prisma/prisma.service';
import type { TokenScope } from './scopes';

const lastUsedPrecisionMs = 60_000;

@Injectable()
export class TokenAuthenticator {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(raw: string): Promise<AuthenticatedUser | null> {
    const now = new Date();
    const token = await this.prisma.accessToken.findUnique({
      where: { tokenHash: linkTokenHash(raw) },
      select: { id: true, userId: true, scopes: true, revokedAt: true, expiresAt: true, user: { select: { isActive: true } } },
    });
    if (!token || token.revokedAt || token.expiresAt <= now || !token.user.isActive) {
      return null;
    }
    await this.prisma.accessToken.updateMany({
      where: {
        id: token.id,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - lastUsedPrecisionMs) } }],
      },
      data: { lastUsedAt: now },
    });
    return {
      id: token.userId,
      sessionId: null,
      isAdmin: false,
      isSystemManager: false,
      scopes: token.scopes as TokenScope[],
    };
  }
}
