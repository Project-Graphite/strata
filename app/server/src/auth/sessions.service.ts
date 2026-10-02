import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, currentSessionId: string | null) {
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
    await this.audit.record(userId, 'session_signed_out');
  }

  async revokeOthers(userId: string, currentSessionId: string | null) {
    await this.prisma.refreshSession.deleteMany({
      where: { userId, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) },
    });
    await this.audit.record(userId, 'other_sessions_signed_out');
  }
}
