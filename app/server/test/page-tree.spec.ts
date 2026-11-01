import { ItemKind, SpaceRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotesService, present } from '../src/notes/notes.service';

function tree() {
  const pages = new Map(['a', 'b', 'c'].map((id, index) => [id, {
    id, title: id, spaceId: 'space', kind: ItemKind.NOTE, trashedAt: null, archivedAt: null,
    note: { parentId: null as string | null, position: index + 1, quick: false, template: false },
    createdAt: new Date(), updatedAt: new Date(), databaseSchema: null, _count: { journalEntries: 0, childNotes: 0 },
  }]));
  const locks: string[] = [];
  const changed = vi.fn();
  const transaction = {
    $queryRaw: async (query: TemplateStringsArray) => { locks.push(query.join('?')); return []; },
    item: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => pages.get(where.id),
      findUnique: async ({ where }: { where: { id: string } }) => pages.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { id: string; spaceId: string } }) => {
        const page = pages.get(where.id);
        return page?.spaceId === where.spaceId && page.kind === ItemKind.NOTE && !page.trashedAt && !page.note.quick ? page : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { title?: string } }) => {
        const page = pages.get(where.id)!;
        if (data.title !== undefined) page.title = data.title;
        return page;
      },
    },
    note: {
      findFirst: async ({ where }: { where: { itemId: string; item: { spaceId: string } } }) => {
        const page = pages.get(where.itemId);
        return page?.spaceId === where.item.spaceId && !page.trashedAt && !page.note.quick && !page.note.template ? page.note : null;
      },
      findMany: async ({ where }: { where: { parentId?: string; itemId: { not: string } } }) => [...pages.values()]
        .filter((page) => (where.parentId === undefined ? page.note.parentId === null : page.note.parentId === where.parentId) && page.id !== where.itemId.not)
        .sort((a, b) => a.note.position - b.note.position)
        .map((page) => ({ itemId: page.id, position: page.note.position })),
      aggregate: async ({ where }: { where: { parentId: string | null; itemId: { not: string } } }) => ({ _max: { position: Math.max(0, ...[...pages.values()].filter((page) => page.note.parentId === where.parentId && page.id !== where.itemId.not).map((page) => page.note.position)) } }),
      update: async ({ where, data }: { where: { itemId: string }; data: { position: number } }) => Object.assign(pages.get(where.itemId)!.note, data),
      upsert: vi.fn(async ({ where, update }: { where: { itemId: string }; update: { parentId?: string | null; position?: number } }) => {
        Object.assign(pages.get(where.itemId)!.note, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)));
      }),
    },
  };
  let pending: Promise<unknown> = Promise.resolve();
  const notes = new NotesService(
    { ...transaction, $transaction: (work: (client: typeof transaction) => Promise<unknown>) => {
      const result = pending.then(() => work(transaction));
      pending = result.catch(() => undefined);
      return result;
    } } as never,
    { assertItem: async (_userId: string, id: string) => ({ ...pages.get(id)!, role: SpaceRole.OWNER }) } as never,
    { record: async () => undefined } as never,
    { notify: changed } as never,
    {} as never,
    { assertPage: async (_userId: string, id: string) => ({ ...pages.get(id)!, role: SpaceRole.OWNER, quick: false, permissions: { organize: true } }) } as never,
  );
  return { notes, pages, locks, changed, transaction };
}

describe('page tree moves', () => {
  it('places pages beside server-side siblings and locks the space before the page', async () => {
    const current = tree();
    await current.notes.update('member', 'c', { relativeTo: 'b', placement: 'before' });
    expect(current.pages.get('c')!.note).toMatchObject({ parentId: null, position: 1.5 });
    expect(current.locks[0]).toContain('FROM "spaces"');
    expect(current.locks[1]).toContain('FROM "items"');
    expect(current.changed).toHaveBeenCalledWith('page-details', { spaceId: 'space', itemId: 'c' });
  });

  it('rebalances crowded sibling positions without changing their order', async () => {
    const current = tree();
    current.pages.get('b')!.note.position = 1 + Number.EPSILON;
    await current.notes.update('member', 'c', { relativeTo: 'b', placement: 'before' });
    expect(['a', 'c', 'b'].map((id) => current.pages.get(id)!.note.position)).toEqual([1, 1.5, 2]);
  });

  it('rejects reciprocal concurrent moves after checking the committed hierarchy', async () => {
    const current = tree();
    const results = await Promise.allSettled([
      current.notes.update('member', 'a', { parentId: 'b' }),
      current.notes.update('member', 'b', { parentId: 'a' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { message: 'A page cannot move inside itself' } });
    expect(current.pages.get('a')!.note.parentId).toBe('b');
    expect(current.pages.get('b')!.note.parentId).toBeNull();
  });

  it('checks ancestors beyond fifty levels and rejects existing cycles', async () => {
    const current = tree();
    for (let index = 0; index < 60; index += 1) current.pages.set(`level-${index}`, { ...current.pages.get('a')!, id: `level-${index}`, note: { ...current.pages.get('a')!.note, parentId: index ? `level-${index - 1}` : 'a' } });
    await expect(current.notes.update('member', 'a', { parentId: 'level-59' })).rejects.toThrow('A page cannot move inside itself');
    current.pages.get('a')!.note.parentId = 'b';
    current.pages.get('b')!.note.parentId = 'a';
    await expect(current.notes.update('member', 'c', { parentId: 'a' })).rejects.toThrow('hierarchy contains a cycle');
    expect(current.transaction.note.upsert).not.toHaveBeenCalled();
  });

  it('rejects ambiguous placement, self placement and anchors in other spaces', async () => {
    const current = tree();
    await expect(current.notes.update('member', 'a', { relativeTo: 'b' })).rejects.toThrow('sibling placement');
    await expect(current.notes.update('member', 'a', { relativeTo: 'b', placement: 'after', parentId: null })).rejects.toThrow('sibling placement');
    await expect(current.notes.update('member', 'a', { relativeTo: 'a', placement: 'after' })).rejects.toThrow('different page');
    current.pages.get('b')!.spaceId = 'other-space';
    await expect(current.notes.update('member', 'a', { relativeTo: 'b', placement: 'after' })).rejects.toThrow('from this space');
    expect(current.transaction.note.upsert).not.toHaveBeenCalled();
  });

  it('reports a changed tree when its placement anchor disappears before sibling lookup', async () => {
    const current = tree();
    vi.spyOn(current.transaction.note, 'findMany').mockResolvedValueOnce([]);
    await expect(current.notes.update('member', 'a', { relativeTo: 'b', placement: 'before' })).rejects.toThrow('The page tree changed. Try the move again.');
    expect(current.transaction.note.upsert).not.toHaveBeenCalled();
  });
});

describe('paginated page children', () => {
  it('returns one hundred siblings and a continuation independently of recent-page ordering', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...tree().pages.get('a')!, id: `page-${index}` }));
    const findMany = vi.fn(async () => rows);
    const assertSpace = vi.fn(async () => undefined);
    const notes = new NotesService({ item: { findMany }, note: { groupBy: async () => [] } } as never, { assertSpace } as never, {} as never, {} as never, {} as never, {} as never);
    const first = await notes.children('member', 'space', {});
    expect(first.pages).toHaveLength(100);
    expect(first.nextCursor).toBe('page-99');
    expect(first.nextPage).toMatchObject({ id: 'page-100' });
    expect(assertSpace).toHaveBeenCalledWith('member', 'space', 'read');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ spaceId: 'space', journalEntries: { none: {} }, childNotes: { none: { item: { journalEntries: { some: {} } } } }, note: { OR: [{ parentId: null }, { parent: { isNot: { kind: ItemKind.NOTE, trashedAt: null, archivedAt: null, note: { is: { quick: false, template: false } } } } }], template: false, quick: false }, trashedAt: null, archivedAt: null }), take: 101, orderBy: [{ note: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }] }));
    findMany.mockResolvedValueOnce([rows[100]!]);
    const second = await notes.children('member', 'space', { cursor: first.nextCursor! });
    expect(second).toMatchObject({ pages: [{ id: 'page-100' }], nextCursor: null });
    expect(second.nextPage).toBeNull();
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: { id: 'page-99' }, skip: 1 }));
  });

  it('says which listed pages have pages inside, not counting journal pages', async () => {
    const base = tree().pages.get('a')!;
    const rows = [{ ...base, id: 'parent' }, { ...base, id: 'leaf' }];
    const groupBy = vi.fn(async () => [{ parentId: 'parent' }]);
    const notes = new NotesService({ item: { findMany: async () => rows }, note: { groupBy } } as never, { assertSpace: async () => undefined } as never, {} as never, {} as never, {} as never, {} as never);
    const listed = await notes.children('member', 'space', {});
    expect(listed.pages.map((page) => [page.id, page.hasChildren])).toEqual([['parent', true], ['leaf', false]]);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['parentId'],
      where: {
        parentId: { in: ['parent', 'leaf'] },
        template: false,
        quick: false,
        item: { kind: { in: [ItemKind.NOTE, ItemKind.BOARD] }, trashedAt: null, archivedAt: null, journalEntries: { none: {} }, childNotes: { none: { item: { journalEntries: { some: {} } } } } },
      },
    });
  });

  it('marks the page that holds journal pages as part of the journal', () => {
    const base = tree().pages.get('a')!;
    expect(present({ ...base, _count: { journalEntries: 0, childNotes: 3 } } as never).journal).toBe(true);
    expect(present(base as never).journal).toBe(false);
  });

  it('does not list children of a private or invalid parent', async () => {
    const findMany = vi.fn();
    const notes = new NotesService({ item: { findMany, findFirst: async () => null } } as never, { assertSpace: async () => undefined } as never, {} as never, {} as never, {} as never, {} as never);
    await expect(notes.children('member', 'space', { parentId: 'private' })).rejects.toThrow('from this space');
    expect(findMany).not.toHaveBeenCalled();
  });
});
