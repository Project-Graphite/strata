import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export function forgetCalendars(prisma: PrismaService, where: Prisma.GoogleCalendarWhereInput) {
  return [
    prisma.item.updateMany({ where: { trashedAt: null, googleEvent: { fromGoogle: true, calendar: where } }, data: { trashedAt: new Date() } }),
    prisma.googleCalendar.deleteMany({ where }),
  ];
}
