import { Injectable, Module } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const calendarSyncKind = 'google.calendar.sync';

@Injectable()
export class CalendarSyncNudge {
  constructor(private readonly prisma: PrismaService) {}

  async eventChanged(itemId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, kind: ItemKind.EVENT, owner: { googleCalendars: { some: {} } } },
      select: { ownerId: true },
    });
    if (item?.ownerId) await this.soon(item.ownerId);
  }

  async soon(userId: string) {
    const queued = await this.prisma.scheduledJob.count({
      where: { kind: calendarSyncKind, doneAt: null, failedAt: null, claimedAt: null, payload: { path: ['userId'], equals: userId } },
    });
    if (!queued) await this.prisma.scheduledJob.create({ data: { kind: calendarSyncKind, runAt: new Date(Date.now() + 5_000), payload: { userId } } });
  }
}

@Module({
  providers: [CalendarSyncNudge],
  exports: [CalendarSyncNudge],
})
export class CalendarSyncNudgeModule {}
