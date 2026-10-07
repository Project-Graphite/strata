import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { linkTokenHash, newLinkToken } from '../crypto/link-token';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { dayMs } from '../recurrence/dates';
import { calendarText } from './ical';

@Injectable()
export class CalendarFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { calendarFeedHash: true } });
    return { enabled: user.calendarFeedHash !== null };
  }

  async reset(userId: string) {
    const { token, tokenHash } = newLinkToken();
    await this.prisma.user.update({ where: { id: userId }, data: { calendarFeedHash: tokenHash } });
    await this.audit.record(userId, 'calendar_feed_reset');
    return { enabled: true, url: this.mail.link(`/api/v1/calendar/${token}.ics`) };
  }

  async disable(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { calendarFeedHash: null } });
    await this.audit.record(userId, 'calendar_feed_disabled');
    return { enabled: false };
  }

  async feed(file: string) {
    const token = /^([A-Za-z0-9_-]{43})\.ics$/.exec(file)?.[1];
    const user = token
      ? await this.prisma.user.findUnique({ where: { calendarFeedHash: linkTokenHash(token) }, select: { id: true, displayName: true, isActive: true } })
      : null;
    if (!user?.isActive) throw new NotFoundException('This calendar link was turned off or reset');
    const items = await this.prisma.item.findMany({
      where: {
        ...this.access.itemsOf(user.id),
        trashedAt: null,
        kind: ItemKind.EVENT,
        event: { OR: [{ repeatRule: { not: null } }, { endsOn: { gte: new Date(Date.now() - 365 * dayMs) } }] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 2_000,
      select: { id: true, title: true, updatedAt: true, event: true },
    });
    return calendarText(
      `${user.displayName}’s Strata agenda`,
      items.flatMap((item) => (item.event ? [{ ...item, event: item.event }] : [])),
      (path) => this.mail.link(path),
    );
  }
}
