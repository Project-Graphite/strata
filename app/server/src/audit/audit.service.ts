import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { networkOf, requestContext } from '../http/request-context';
import { PrismaService } from '../prisma/prisma.service';

const pageSize = 50;

export const authActions = [
  'signed_in',
  'sign_in_failed',
  'password_changed',
  'password_reset',
  'email_change_requested',
  'email_changed',
  'two_step_enabled',
  'two_step_disabled',
  'recovery_codes_regenerated',
  'session_signed_out',
  'other_sessions_signed_out',
  'refresh_token_reused',
  'access_token_created',
  'access_token_revoked',
  'capture_device_connected',
  'capture_device_revoked',
  'account_deleted',
] as const;

export type AuditAction =
  | (typeof authActions)[number]
  | 'calendar_feed_reset'
  | 'calendar_feed_disabled'
  | 'share_link_created'
  | 'share_link_revoked'
  | 'page_grant_saved'
  | 'page_grant_removed'
  | 'webhook_created'
  | 'webhook_updated'
  | 'webhook_deleted'
  | 'member_role_changed'
  | 'admin_granted'
  | 'admin_revoked'
  | 'system_manager_granted'
  | 'system_manager_revoked'
  | 'site_settings_changed';

export function auditEvent(userId: string | null, action: AuditAction, data: Prisma.InputJsonObject = {}, actorId = userId) {
  const request = requestContext.getStore()?.request;
  const network = request && (authActions as readonly AuditAction[]).includes(action) ? networkOf(request) : {};
  return { userId, actorId, action, data: { ...data, ...network } };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, action: AuditAction, data: Prisma.InputJsonObject = {}) {
    await this.prisma.auditEvent.create({ data: auditEvent(userId, action, data) });
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
