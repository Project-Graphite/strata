import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { inActiveSpace } from '../../frontend/src/active-space';
import { AccessService } from '../src/access/access.service';
import { ListTasksDto } from '../src/tasks/dto/tasks.dto';
import { TasksService } from '../src/tasks/tasks.service';
import { PageKindQueryDto } from '../src/notes/dto/notes.dto';
import { FilesService } from '../src/files/files.service';

const spaceId = '10000000-0000-4000-8000-000000000001';

describe('active workspace', () => {
  it('scopes aggregate reads while retaining filters and replacing a stale space', () => {
    expect(inActiveSpace('/me/tasks?page=2&completed=true&spaceId=old', spaceId)).toBe(`/me/tasks?page=2&completed=true&spaceId=${spaceId}`);
    expect(inActiveSpace('/subscriptions/summary', spaceId)).toBe(`/subscriptions/summary?spaceId=${spaceId}`);
    expect(inActiveSpace('/agenda?from=2026-10-25&to=2026-10-26', spaceId)).toBe(`/agenda?from=2026-10-25&to=2026-10-26&spaceId=${spaceId}`);
  });

  it('keeps explicit resource URLs and account-level APIs unchanged', () => {
    for (const path of ['/spaces', '/me', '/me/sessions', '/me/dashboards', '/spaces/other/tasks?page=1', '/notes/page', '/me/journal']) {
      expect(inActiveSpace(path, spaceId)).toBe(path);
    }
    expect(inActiveSpace('/me/tasks')).toBe('/me/tasks');
  });

  it('validates space IDs alongside existing task and page filters', async () => {
    const tasks = plainToInstance(ListTasksDto, { spaceId, page: '2', completed: 'true' });
    expect(await validate(tasks)).toEqual([]);
    expect(tasks.page).toBe(2);
    expect(tasks.completed).toBe(true);
    expect(await validate(plainToInstance(PageKindQueryDto, { spaceId, kind: 'note' }))).toEqual([]);
    expect((await validate(plainToInstance(ListTasksDto, { spaceId: 'not-a-space' }))).map((error) => error.property)).toContain('spaceId');
  });

  it('applies the same space and membership constraints before task counts and pagination', async () => {
    const prisma = {
      item: { count: vi.fn().mockResolvedValue(26), findMany: vi.fn().mockResolvedValue([]) },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const service = new TasksService(prisma as never, new AccessService({} as never), {} as never, {} as never, {} as never, {} as never);
    const result = await service.mine('reader', Object.assign(new ListTasksDto(), { spaceId, page: 2 }));
    const where = prisma.item.count.mock.calls[0]![0].where;

    expect(where.spaceId).toBe(spaceId);
    expect(where.space.members.some.userId).toBe('reader');
    expect(where.task.OR).toBeUndefined();
    expect(prisma.item.findMany.mock.calls[0]![0].where).toEqual(where);
    expect(prisma.item.findMany.mock.calls[0]![0].skip).toBeGreaterThan(0);
    expect(result.totalResults).toBe(26);
  });

  it('shows workspace uploads from other members without charging them to the viewer quota', async () => {
    const own = { itemId: 'own', sizeBytes: 10, item: { spaceId: 'personal', trashedAt: null } };
    const shared = { itemId: 'shared', sizeBytes: 25, originalName: 'team.txt', item: { spaceId, trashedAt: null } };
    const prisma = {
      file: { findMany: vi.fn().mockResolvedValueOnce([own]).mockResolvedValueOnce([shared]) },
      item: { findMany: vi.fn().mockResolvedValue([{ id: 'shared' }]) },
    };
    const service = new FilesService(prisma as never, new AccessService({} as never), {} as never, {} as never, { get: async () => ({ fileQuotaMb: 10 }) } as never, {} as never);
    const result = await service.storage('reader', spaceId);

    expect(result.files.map((file) => file.id)).toEqual(['shared']);
    expect(result.usedBytes).toBe(10);
    expect(prisma.file.findMany.mock.calls[1]![0].where.item.spaceId).toBe(spaceId);
    expect(prisma.file.findMany.mock.calls[1]![0].where.item.space.members.some.userId).toBe('reader');
  });
});
