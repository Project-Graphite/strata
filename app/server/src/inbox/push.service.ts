import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import webpush, { WebPushError } from 'web-push';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { SavePushSubscriptionDto } from './dto/push.dto';
import type { InboxEntry } from './inbox-kinds';

const deliverKind = 'push.deliver';

export function isPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const host = url.hostname;
  return (
    url.protocol === 'https:' &&
    !url.port &&
    (host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com'))
  );
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.jobs.handle(deliverKind, (payload) => this.deliver(payload as unknown as { entries: InboxEntry[] }));
  }

  private get vapid() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
  }

  publicKey() {
    return { publicKey: this.vapid?.publicKey ?? null };
  }

  async save(userId: string, input: SavePushSubscriptionDto) {
    if (!this.vapid) throw new ServiceUnavailableException('Notifications are not set up on this server');
    if (!isPushEndpoint(input.endpoint)) throw new BadRequestException('That is not a browser notification address');
    const fields = { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, kinds: input.kinds };
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...fields },
      update: { ...fields, lastUsedAt: new Date() },
      select: { kinds: true },
    });
  }

  async find(userId: string, endpoint: string) {
    const found = await this.prisma.pushSubscription.findFirst({ where: { userId, endpoint }, select: { kinds: true } });
    if (!found) throw new NotFoundException('Notifications are off on this device');
    return found;
  }

  async remove(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async queue(client: Prisma.TransactionClient, entries: InboxEntry[]) {
    if (!this.vapid || entries.length === 0) return;
    const subscribed = await client.pushSubscription.findMany({
      where: { userId: { in: [...new Set(entries.map((entry) => entry.userId))] } },
      select: { userId: true, kinds: true },
    });
    const wanted = entries.filter((entry) => subscribed.some((device) => device.userId === entry.userId && device.kinds.includes(entry.kind)));
    if (wanted.length === 0) return;
    await this.jobs.schedule(
      deliverKind,
      new Date(),
      { entries: wanted.map(({ userId, kind, title, link }) => ({ userId, kind, title, link: link ?? null })) },
      client,
    );
  }

  private async deliver({ entries }: { entries: InboxEntry[] }) {
    const vapid = this.vapid;
    if (!vapid) return;
    for (const entry of entries) {
      const devices = await this.prisma.pushSubscription.findMany({ where: { userId: entry.userId, kinds: { has: entry.kind } } });
      for (const device of devices) {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            JSON.stringify({ title: entry.title, link: entry.link ?? '/inbox' }),
            { vapidDetails: vapid, TTL: 24 * 60 * 60, timeout: 10_000 },
          );
          await this.prisma.pushSubscription.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
        } catch (error) {
          if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
            await this.prisma.pushSubscription.delete({ where: { id: device.id } });
          } else {
            this.logger.warn(`A notification to one device could not be sent: ${(error as Error).message}`);
          }
        }
      }
    }
  }
}
