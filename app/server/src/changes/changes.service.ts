import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { Observable } from 'rxjs';
import type { RedisClientType } from 'redis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type Topic = 'items' | 'tasks' | 'subscriptions' | 'spaces' | 'inbox' | 'spending' | 'habits' | 'journal' | 'dashboards' | 'pages';

export interface Change {
  spaceId?: string;
  topic: Topic;
}

type Nudge = { topic: Topic } & ({ spaceId: string } | { userId: string });

interface Batch {
  nudges: Nudge[];
  sent: boolean;
}

const changesChannel = 'changes';

@Injectable()
export class ChangesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChangesService.name);
  private readonly listeners = new Map<string, Set<(change: Change) => void>>();
  private readonly pending = new AsyncLocalStorage<Batch>();
  private subscriber?: RedisClientType;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onApplicationBootstrap() {
    void this.redis.subscribe(changesChannel, (message) => this.deliver(message)).then((subscriber) => {
      this.subscriber = subscriber;
    });
  }

  notify(topic: Topic, audience: { spaceId: string } | { userId: string }) {
    const nudge = { topic, ...audience };
    const batch = this.pending.getStore();
    if (batch && !batch.sent) batch.nudges.push(nudge);
    else void this.publish([nudge]);
  }

  afterResponse = (_request: Request, response: Response, next: NextFunction) => {
    const batch: Batch = { nudges: [], sent: false };
    response.on('finish', () => this.send(batch));
    this.pending.run(batch, next);
  };

  async afterWork<T>(work: () => Promise<T>) {
    const batch: Batch = { nudges: [], sent: false };
    try {
      return await this.pending.run(batch, work);
    } finally {
      this.send(batch);
    }
  }

  of(userId: string) {
    return new Observable<Change>((subscriber) => {
      const listener = (change: Change) => subscriber.next(change);
      const listening = this.listeners.get(userId) ?? new Set();
      listening.add(listener);
      this.listeners.set(userId, listening);
      return () => {
        listening.delete(listener);
        if (listening.size === 0) this.listeners.delete(userId);
      };
    });
  }

  private send(batch: Batch) {
    batch.sent = true;
    void this.publish(batch.nudges);
  }

  private async publish(nudges: Nudge[]) {
    try {
      for (const key of new Set(nudges.map((nudge) => JSON.stringify(nudge)))) {
        const nudge = JSON.parse(key) as Nudge;
        const message = JSON.stringify(
          'userId' in nudge
            ? { userIds: [nudge.userId], change: { topic: nudge.topic } }
            : {
                userIds: (await this.prisma.spaceMember.findMany({ where: { spaceId: nudge.spaceId }, select: { userId: true } })).map((member) => member.userId),
                change: { spaceId: nudge.spaceId, topic: nudge.topic },
              },
        );
        const published = await this.redis.run((client) => client.publish(changesChannel, message));
        if (published === undefined || !this.subscriber?.isReady) this.deliver(message);
      }
    } catch (error) {
      this.logger.error('Could not send change nudges', error);
    }
  }

  private deliver(message: string) {
    const { change, userIds } = JSON.parse(message) as { change: Change; userIds: string[] };
    for (const userId of userIds) {
      for (const listener of this.listeners.get(userId) ?? []) listener(change);
    }
  }
}
