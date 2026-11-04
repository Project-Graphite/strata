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
    expect(inActiveSpace('/me/pages?spaceId=old', spaceId)).toBe(`/me/pages?spaceId=${spaceId}`);
    expect(inActiveSpace('/me/notes?kind=board', spaceId)).toBe(`/me/notes?kind=board&spaceId=${spaceId}`);
  });

  it('scopes aggregate reads to the account when no space is chosen, and keeps an explicit account home', () => {
    expect(inActiveSpace('/me/tasks')).toBe('/me/tasks?home=account');
    expect(inActiveSpace('/me/tasks?page=2&spaceId=old')).toBe('/me/tasks?page=2&home=account');
    expect(inActiveSpace('/me/lists?home=account', spaceId)).toBe('/me/lists?home=account');
    expect(inActiveSpace('/me/storage')).toBe('/me/storage');
  });

  it('keeps explicit resource URLs and account-level APIs unchanged', () => {
    for (const path of ['/spaces', '/me', '/me/sessions', '/me/dashboards', '/spaces/other/tasks?page=1', '/notes/page', '/me/journal', '/subscriptions/summary', '/me/spending', '/agenda?from=2026-10-25&to=2026-10-26', '/me/bookmarks', '/me/goals', '/me/habits', '/me/storage']) {
      expect(inActiveSpace(path, spaceId)).toBe(path);
    }
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

  it('lists every upload by its home, whichever space is active, and counts what the viewer can no longer open', async () => {
    const file = (itemId: string, sizeBytes: number, item: object) => ({ itemId, sizeBytes, originalName: `${itemId}.txt`, mimeType: 'text/plain', createdAt: new Date(), item: { ownerId: null, spaceId: null, trashedAt: null, space: null, linksIn: [], ...item } });
    const rows = [
      file('mine', 10, { ownerId: 'reader' }),
      file('attached', 25, { spaceId, space: { name: 'Flat', members: [{ userId: 'reader' }] }, linksIn: [{ source: { id: 'task', kind: 'TASK', title: 'Fix the tap' } }] }),
      file('left', 40, { spaceId: 'gone', space: { name: 'Old club', members: [] } }),
      file('binned', 5, { ownerId: 'reader', trashedAt: new Date() }),
    ];
    const prisma = { file: { findMany: vi.fn().mockResolvedValue(rows) } };
    const service = new FilesService(prisma as never, new AccessService({} as never), {} as never, {} as never, { get: async () => ({ fileQuotaMb: 10 }) } as never, {} as never);
    const result = await service.storage('reader');

    expect(prisma.file.findMany.mock.calls[0]![0].where).toEqual({ uploadedById: 'reader' });
    expect(result).toMatchObject({ usedBytes: 80, trashedBytes: 5, elsewhereBytes: 40 });
    expect(result.homes).toEqual([
      { spaceId: null, spaceName: null, count: 1, sizeBytes: 10 },
      { spaceId, spaceName: 'Flat', count: 1, sizeBytes: 25 },
    ]);
    expect(result.files.map((entry) => [entry.id, entry.spaceName, entry.attachedTo?.title ?? null])).toEqual([
      ['mine', null, null],
      ['attached', 'Flat', 'Fix the tap'],
    ]);
  });
});
