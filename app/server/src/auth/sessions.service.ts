import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastUsedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, deviceLabel: true, signedInAt: true, lastUsedAt: true },
    });
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  }

  async revoke(userId: string, sessionId: string) {
    const revoked = await this.prisma.refreshSession.deleteMany({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (revoked.count === 0) {
      throw new NotFoundException('That session has already ended');
    }
  }

  async revokeOthers(userId: string, currentSessionId: string) {
    await this.prisma.refreshSession.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
  }
}
