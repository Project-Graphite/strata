import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { AccessService } from '../access/access.service';
import { SecretBox } from '../crypto/secret-box.service';
import { JobsService } from '../jobs/jobs.service';
import { MaintenanceScheduler } from '../jobs/maintenance.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { dayMs } from '../recurrence/dates';
import { checkedUrl, postPublic, UnsafeUrlError } from '../widgets/safe-fetch';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhooks.dto';

const deliverKind = 'webhook.deliver';
const maxWebhooks = 10;
const scanEveryMs = 30_000;
const batchSize = 100;
const keepDays = 14;

const webhookFields = {
  id: true,
  spaceId: true,
  host: true,
  events: true,
  active: true,
  createdAt: true,
  deliveries: { orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 1, select: { status: true, error: true, createdAt: true } },
} satisfies Prisma.WebhookSelect;

function present({ deliveries, ...webhook }: Prisma.WebhookGetPayload<{ select: typeof webhookFields }>) {
  return { ...webhook, lastDelivery: deliveries[0] ?? null };
}

export function signature(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksService.name);
  private timer?: NodeJS.Timeout;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly box: SecretBox,
    private readonly jobs: JobsService,
    private readonly maintenance: MaintenanceScheduler,
  ) {}

  onModuleInit() {
    this.jobs.handle(deliverKind, (payload) => this.deliver((payload as { deliveryId: string }).deliveryId));
    this.maintenance.register((now) => this.prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - keepDays * dayMs) } } }));
    this.timer = setInterval(() => void this.scan(), scanEveryMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async list(userId: string) {
    const rows = await this.prisma.webhook.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: webhookFields });
    return rows.map(present);
  }

  async create(userId: string, input: CreateWebhookDto) {
    if (input.spaceId) await this.access.assertSpace(userId, input.spaceId, 'read');
    if ((await this.prisma.webhook.count({ where: { userId } })) >= maxWebhooks) {
      throw new ConflictException(`You can have ${maxWebhooks} webhooks. Delete one you no longer use.`);
    }
    const host = this.checked(input.url).host;
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const created = await this.prisma.webhook.create({
      data: {
        userId,
        spaceId: input.spaceId ?? null,
        urlSealed: this.box.seal(input.url),
        host,
        secretSealed: this.box.seal(secret),
        events: [...new Set(input.events)],
      },
      select: webhookFields,
    });
    return { ...present(created), secret };
  }

  async update(userId: string, id: string, input: UpdateWebhookDto) {
    await this.owned(userId, id);
    const updated = await this.prisma.webhook.update({
      where: { id },
      data: { active: input.active, events: input.events && [...new Set(input.events)], ...(input.active ? { cursor: new Date() } : {}) },
      select: webhookFields,
    });
    return present(updated);
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.webhook.deleteMany({ where: { id } });
  }

  async deliveries(userId: string, id: string) {
    await this.owned(userId, id);
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 20,
      select: { id: true, event: true, status: true, error: true, attempts: true, deliveredAt: true, createdAt: true },
    });
  }

  async ping(userId: string, id: string) {
    await this.owned(userId, id);
    const delivery = await this.prisma.webhookDelivery.create({
      data: { webhookId: id, event: 'ping', payload: { event: 'ping', occurredAt: new Date().toISOString() } },
      select: { id: true },
    });
    await this.send(delivery.id);
    return this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
      select: { id: true, event: true, status: true, error: true, attempts: true, deliveredAt: true, createdAt: true },
    });
  }

  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const webhooks = await this.prisma.webhook.findMany({ where: { active: true }, select: { id: true, userId: true, spaceId: true, events: true, cursor: true } });
      for (const webhook of webhooks) await this.queue(webhook);
      if (webhooks.length > 0) void this.jobs.runDue();
    } catch (error) {
      this.logger.error('Queueing webhook deliveries failed; retrying on the next scan', error);
    } finally {
      this.scanning = false;
    }
  }

  async deliver(deliveryId: string) {
    const error = await this.send(deliveryId);
    if (error) throw new Error(error);
  }

  private async send(deliveryId: string) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, event: true, payload: true, attempts: true, webhook: { select: { urlSealed: true, secretSealed: true, active: true } } },
    });
    if (!delivery || (!delivery.webhook.active && delivery.event !== 'ping')) return null;
    const body = JSON.stringify({ id: delivery.id, ...(delivery.payload as Prisma.JsonObject) });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = {
      'X-Strata-Event': delivery.event,
      'X-Strata-Delivery': delivery.id,
      'X-Strata-Timestamp': timestamp,
      'X-Strata-Signature': signature(this.box.open(delivery.webhook.secretSealed), timestamp, body),
    };
    const outcome = await postPublic(this.box.open(delivery.webhook.urlSealed), body, headers, 10_000).then(
      (status) => ({ status, error: status >= 200 && status < 300 ? null : `The address answered with status ${status}` }),
      (error: Error) => ({ status: null, error: error.message.slice(0, 200) }),
    );
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: outcome.status, error: outcome.error, attempts: delivery.attempts + 1, deliveredAt: outcome.error ? null : new Date() },
    });
    return outcome.error;
  }

  private async queue(webhook: { id: string; userId: string; spaceId: string | null; events: string[]; cursor: Date }) {
    const events = await this.prisma.activityEvent.findMany({
      where: {
        createdAt: { gt: webhook.cursor },
        verb: { in: webhook.events },
        space: { AND: [this.access.spacesOf(webhook.userId), ...(webhook.spaceId ? [{ id: webhook.spaceId }] : [])] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
      select: {
        id: true,
        verb: true,
        data: true,
        createdAt: true,
        space: { select: { id: true, name: true } },
        actor: { select: { id: true, displayName: true } },
        item: { select: { id: true, kind: true, title: true } },
      },
    });
    if (events.length === 0) return;
    const claimed = await this.prisma.webhook.updateMany({ where: { id: webhook.id, cursor: webhook.cursor }, data: { cursor: events.at(-1)!.createdAt } });
    if (claimed.count === 0) return;
    for (const event of events) {
      const delivery = await this.prisma.webhookDelivery.upsert({
        where: { webhookId_activityId: { webhookId: webhook.id, activityId: event.id } },
        create: {
          webhookId: webhook.id,
          activityId: event.id,
          event: event.verb,
          payload: {
            event: event.verb,
            occurredAt: event.createdAt.toISOString(),
            space: event.space,
            actor: event.actor,
            item: event.item && { ...event.item, kind: event.item.kind.toLowerCase() },
            data: event.data ?? {},
          },
        },
        update: {},
        select: { id: true, attempts: true },
      });
      if (delivery.attempts === 0) await this.jobs.schedule(deliverKind, new Date(), { deliveryId: delivery.id });
    }
  }

  private checked(url: string) {
    try {
      return checkedUrl(url);
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async owned(userId: string, id: string) {
    if (!(await this.prisma.webhook.count({ where: { id, userId } }))) throw new NotFoundException('Webhook not found');
  }
}
