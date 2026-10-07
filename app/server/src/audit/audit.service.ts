import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const pageSize = 50;

export type AuditAction =
  | 'signed_in'
  | 'sign_in_failed'
  | 'password_changed'
  | 'password_reset'
  | 'email_change_requested'
  | 'email_changed'
  | 'two_step_enabled'
  | 'two_step_disabled'
  | 'recovery_codes_regenerated'
  | 'session_signed_out'
  | 'other_sessions_signed_out'
  | 'access_token_created'
  | 'access_token_revoked'
  | 'calendar_feed_reset'
  | 'calendar_feed_disabled';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, action: AuditAction, data: Prisma.InputJsonObject = {}) {
    await this.prisma.auditEvent.create({ data: { userId, actorId: userId, action, data } });
  }

  async list(userId: string, page: number) {
    const [total, events] = await this.prisma.$transaction([
      this.prisma.auditEvent.count({ where: { userId } }),
      this.prisma.auditEvent.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, action: true, data: true, createdAt: true },
      }),
    ]);
    return {
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      totalResults: total,
      results: events,
    };
  }
}
