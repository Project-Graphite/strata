import { Controller, ExecutionContext, Global, INestApplication, Logger, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { firstValueFrom, toArray } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChangesController } from '../src/changes/changes.controller';
import { ChangesModule } from '../src/changes/changes.module';
import { ChangesService, type Change } from '../src/changes/changes.service';
import { requestLog } from '../src/http/request-log';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

const members = { spaceMember: { findMany: () => Promise.resolve([{ userId: 'member-a' }, { userId: 'member-b' }]) }, pageGrant: { findMany: () => Promise.resolve([]) } };
const withoutRedis = { subscribe: () => Promise.resolve(undefined), run: () => Promise.resolve(undefined) };

function sharedRedis() {
  const listeners: ((message: string) => void)[] = [];
  return {
    subscribe: (_channel: string, listener: (message: string) => void) => {
      listeners.push(listener);
      return Promise.resolve({ isReady: true });
    },
    run: (operation: (client: { publish: (channel: string, message: string) => Promise<number> }) => Promise<number>) =>
      operation({
        publish: (_channel, message) => {
          for (const listener of listeners) listener(message);
          return Promise.resolve(listeners.length);
        },
      }),
  };
}

function receiver(changes: ChangesService, userId: string) {
  const received: Change[] = [];
  changes.of(userId).subscribe((change) => received.push(change));
  return received;
}

describe('ChangesService', () => {
  it('delivers only page-scoped updates to direct recipients without exposing space-wide events', async () => {
    const grants = vi.fn(async () => [{ userId: 'recipient' }]);
    const changes = new ChangesService({ ...members, pageGrant: { findMany: grants } } as never, withoutRedis as never);
    const received = receiver(changes, 'recipient');
    const unrelated = receiver(changes, 'unrelated');
    changes.notify('page-comments', { spaceId: 'private-space', itemId: 'shared-page' });
    await vi.waitFor(() => expect(received).toEqual([{ topic: 'page-comments', itemId: 'shared-page' }]));
    expect(grants).toHaveBeenCalledWith({ where: { itemId: 'shared-page', item: { kind: { in: ['NOTE', 'BOARD'] }, trashedAt: null, archivedAt: null } }, select: { userId: true } });
    changes.notify('tasks', { spaceId: 'private-space' });
    changes.notify('page-details', { spaceId: 'private-space' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(received).toHaveLength(1);
    expect(unrelated).toEqual([]);
    expect(grants).toHaveBeenCalledTimes(1);
  });
  it('preserves page scope when delivering metadata and discussion events', async () => {
    const changes = new ChangesService(members as never, withoutRedis as never);
    const received = receiver(changes, 'member-a');
    changes.notify('page-comments', { spaceId: 'space-1', itemId: 'page-1' });
    await vi.waitFor(() => expect(received).toHaveLength(1));
    changes.notify('page-databases', { userId: 'member-a', itemId: 'database-1' });
    await vi.waitFor(() => expect(received).toEqual([
      { topic: 'page-comments', spaceId: 'space-1', itemId: 'page-1' },
      { topic: 'page-databases', itemId: 'database-1' },
    ]));
  });
  it('nudges every member of a space, and only the user for personal changes', async () => {
    const changes = new ChangesService(members as never, withoutRedis as never);
    const memberA = receiver(changes, 'member-a');
    const memberB = receiver(changes, 'member-b');
    const outsider = receiver(changes, 'outsider');

    changes.notify('tasks', { spaceId: 'space-1' });
    await vi.waitFor(() => expect(memberB).toEqual([{ spaceId: 'space-1', topic: 'tasks' }]));
    changes.notify('inbox', { userId: 'member-b' });

    await vi.waitFor(() => expect(memberB).toEqual([{ spaceId: 'space-1', topic: 'tasks' }, { topic: 'inbox' }]));
    expect(memberA).toEqual([{ spaceId: 'space-1', topic: 'tasks' }]);
    expect(outsider).toEqual([]);
  });

  it('fans nudges out through Redis to listeners on every instance, once each', async () => {
    const redis = sharedRedis();
    const first = new ChangesService(members as never, redis as never);
    const second = new ChangesService(members as never, redis as never);
    first.onApplicationBootstrap();
    second.onApplicationBootstrap();
    await Promise.resolve();
    const onFirst = receiver(first, 'member-a');
    const onSecond = receiver(second, 'member-b');

    first.notify('spending', { spaceId: 'space-1' });

    await vi.waitFor(() => expect(onSecond).toEqual([{ spaceId: 'space-1', topic: 'spending' }]));
    expect(onFirst).toEqual([{ spaceId: 'space-1', topic: 'spending' }]);
  });

  it('holds nudges made during a piece of work until it settles, sends each once, and still sends them when it fails', async () => {
    const changes = new ChangesService(members as never, withoutRedis as never);
    const received = receiver(changes, 'member-a');
    let finish!: () => void;

    const work = changes.afterWork(async () => {
      changes.notify('items', { spaceId: 'space-1' });
      changes.notify('items', { spaceId: 'space-1' });
      await new Promise<void>((resolve) => (finish = resolve));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toEqual([]);
    finish();
    await work;
    await vi.waitFor(() => expect(received).toEqual([{ spaceId: 'space-1', topic: 'items' }]));

    await expect(
      changes.afterWork(() => {
        changes.notify('habits', { userId: 'member-a' });
        return Promise.reject(new Error('rolled back'));
      }),
    ).rejects.toThrow('rolled back');
    await vi.waitFor(() => expect(received).toEqual([{ spaceId: 'space-1', topic: 'items' }, { topic: 'habits' }]));
  });
});

describe('ChangesController', () => {
  afterEach(() => vi.useRealTimers());

  it('sends a heartbeat comment every 25 seconds and ends the stream when an access token would expire', async () => {
    vi.useFakeTimers();
    const changes = new ChangesService(members as never, withoutRedis as never);
    const events = firstValueFrom(new ChangesController(changes).stream({ id: 'member-a' } as never, new AbortController().signal).pipe(toArray()));

    changes.notify('inbox', { userId: 'member-a' });
    await vi.advanceTimersByTimeAsync(15 * 60_000);

    const sent = await events;
    expect(sent[0]).toEqual({ data: { topic: 'inbox' } });
    expect(sent.slice(1)).toHaveLength(35);
    expect(sent.slice(1).every((event) => event.comment === 'heartbeat')).toBe(true);
  });
});

let release = () => undefined as void;

@Controller('probe')
class ProbeController {
  constructor(private readonly changes: ChangesService) {}

  @Post()
  async change() {
    this.changes.notify('tasks', { spaceId: 'space-1' });
    await new Promise<void>((resolve) => (release = resolve));
    return {};
  }
}

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: members },
    { provide: RedisService, useValue: withoutRedis },
  ],
  exports: [PrismaService, RedisService],
})
class Infrastructure {}

describe('GET /me/changes', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [Infrastructure, ChangesModule],
      controllers: [ProbeController],
      providers: [
        {
          provide: APP_GUARD,
          useValue: {
            canActivate: (context: ExecutionContext) => {
              const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user: object }>();
              request.user = { id: request.headers['x-user'] };
              return true;
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.use(requestLog);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(() => app.close());

  async function open(userId: string) {
    const controller = new AbortController();
    const response = await fetch(`${base}/me/changes`, { headers: { 'x-user': userId }, signal: controller.signal });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    const received: Change[] = [];
    void (async () => {
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (done) return;
        buffer += value;
        const events = buffer.split('\n\n');
        buffer = events.pop()!;
        for (const line of events.flatMap((event) => event.split('\n'))) {
          if (line.startsWith('data: ')) received.push(JSON.parse(line.slice('data: '.length)) as Change);
        }
      }
    })();
    return { response, received, close: () => controller.abort() };
  }

  it('streams a nudge to each member only after the change has been answered', async () => {
    const memberA = await open('member-a');
    const outsider = await open('outsider');
    expect(memberA.response.headers.get('content-type')).toBe('text/event-stream');

    const answered = fetch(`${base}/probe`, { method: 'POST', headers: { 'x-user': 'member-b' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(memberA.received).toEqual([]);
    release();
    expect((await answered).status).toBe(201);

    await vi.waitFor(() => expect(memberA.received).toEqual([{ spaceId: 'space-1', topic: 'tasks' }]));
    expect(outsider.received).toEqual([]);
    memberA.close();
    outsider.close();
  });

  it('refuses a sixth open stream per user with 429 and frees the place once a stream closes', async () => {
    const [first, ...others] = await Promise.all(Array.from({ length: 5 }, () => open('many-tabs')));
    const elsewhere = await open('one-tab');
    const connect = (signal?: AbortSignal) => fetch(`${base}/me/changes`, { headers: { 'x-user': 'many-tabs' }, signal });

    expect([first, ...others].every((stream) => stream?.response.status === 200)).toBe(true);
    expect(elsewhere.response.status).toBe(200);
    expect((await connect()).status).toBe(429);

    first?.close();
    const reopened = new AbortController();
    await vi.waitFor(async () => expect((await connect(reopened.signal)).status).toBe(200));

    reopened.abort();
    for (const stream of [...others, elsewhere]) stream.close();
  });

  it('logs the stream once when the client goes away', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const stream = await open('leaving-viewer');

    stream.close();

    await vi.waitFor(() => expect(log.mock.calls.filter(([entry]) => (entry as { userId?: string }).userId === 'leaving-viewer')).toEqual([[expect.objectContaining({ route: '/api/v1/me/changes', status: 200 })]]));
  });
});
