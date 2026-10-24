import { ItemKind, SpaceRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NoteCommentsService } from '../src/notes/note-comments.service';
import { NoteDatabasesService } from '../src/notes/note-databases.service';
import { NotesService } from '../src/notes/notes.service';

function page() {
  const row = { id: 'page', title: 'Original', kind: ItemKind.NOTE, spaceId: 'space', createdAt: new Date(), updatedAt: new Date(), note: { quick: false }, databaseSchema: null, _count: { journalEntries: 0 } };
  const changed = vi.fn();
  const titleChanged = vi.fn();
  const transaction = {
    $queryRaw: async () => [],
    note: { upsert: vi.fn(async () => ({})) },
    item: {
      findUniqueOrThrow: async () => row,
      updateMany: async ({ where, data }: { where: { title: string }; data: { title: string } }) => {
        if (row.title !== where.title) return { count: 0 };
        row.title = data.title;
        return { count: 1 };
      },
      update: async ({ data }: { data: { title?: string } }) => {
        if (data.title !== undefined) row.title = data.title;
        row.updatedAt = new Date();
        return row;
      },
    },
  };
  const notes = new NotesService(
    { ...transaction, $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction) } as never,
    { assertItem: async () => ({ ...row, role: SpaceRole.OWNER, trashedAt: null }) } as never,
    { record: async () => undefined } as never,
    { notify: changed } as never,
    { titleChanged } as never,
    { assertPage: async () => ({ ...row, role: SpaceRole.OWNER, trashedAt: null, permissions: { organize: true } }) } as never,
  );
  return { notes, row, changed, titleChanged, transaction };
}

function database() {
  let schema = { properties: [{ id: 'text', name: 'Text', type: 'text' }, { id: 'cost', name: 'Cost', type: 'number' }], view: 'table', groupBy: null, dateBy: null, updatedAt: new Date('2026-10-23T10:00:00Z') };
  const values = new Map<string, unknown>([['text', 'Original'], ['cost', 1]]);
  const changed = vi.fn();
  const transaction = {
    $queryRaw: async () => [],
    note: { findUnique: async () => ({ parentId: 'database' }) },
    databaseSchema: {
      findUnique: async () => structuredClone(schema),
      updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: typeof schema }) => {
        if (where.updatedAt.getTime() !== schema.updatedAt.getTime()) return { count: 0 };
        schema = structuredClone(data);
        return { count: 1 };
      },
    },
    noteProperty: {
      findMany: async () => [...values].map(([propertyId, value]) => ({ itemId: 'row', propertyId, value })),
      upsert: async ({ create }: { create: { propertyId: string; value: unknown } }) => values.set(create.propertyId, create.value),
      deleteMany: async ({ where }: { where: { propertyId: string } }) => values.delete(where.propertyId),
      delete: async ({ where }: { where: { itemId_propertyId: { propertyId: string } } }) => values.delete(where.itemId_propertyId.propertyId),
    },
    item: { findMany: async () => [], update: async () => ({}) },
    spaceMember: { findMany: async () => [] },
  };
  const databases = new NoteDatabasesService(
    { ...transaction, $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction) } as never,
    { note: async () => ({ spaceId: 'space', trashedAt: null, quick: false, permissions: { organize: true, spaceRole: 'owner' } }) } as never,
    { notify: changed } as never,
    { assertPage: async () => ({}), pagesOf: () => ({}) } as never,
  );
  return { databases, values, changed, schema: () => structuredClone(schema) };
}

describe('collaborative page metadata', () => {
  it('keeps the newer title when a stale rename arrives', async () => {
    const current = page();
    await current.notes.update('member', 'page', { title: 'Remote title', expectedTitle: 'Original' });
    current.changed.mockClear();
    current.titleChanged.mockClear();
    await expect(current.notes.update('member', 'page', { title: 'Stale title', expectedTitle: 'Original' })).rejects.toThrow('Someone renamed this page');
    expect(current.row.title).toBe('Remote title');
    expect(current.changed).not.toHaveBeenCalled();
    expect(current.titleChanged).not.toHaveBeenCalled();
  });

  it('accepts exactly one of two renames based on the same title', async () => {
    const current = page();
    const results = await Promise.allSettled([
      current.notes.update('member', 'page', { title: 'First', expectedTitle: 'Original' }),
      current.notes.update('member', 'page', { title: 'Second', expectedTitle: 'Original' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(current.changed).toHaveBeenCalledExactlyOnceWith('page-details', { spaceId: 'space', itemId: 'page' });
    expect(current.titleChanged).toHaveBeenCalledExactlyOnceWith('page', current.row.title, current.row.updatedAt);
  });

  it('requires the new title when a previous title is supplied', async () => {
    const current = page();
    await expect(current.notes.update('member', 'page', { expectedTitle: 'Original' })).rejects.toThrow('Include a title');
    expect(current.transaction.note.upsert).not.toHaveBeenCalled();
  });

  it('refuses a stale schema before clearing any property values', async () => {
    const current = database();
    await expect(current.databases.save('member', 'database', { properties: [], view: 'table', expectedRevision: '2026-10-22T10:00:00Z' })).rejects.toThrow('The database changed');
    expect(Object.fromEntries(current.values)).toEqual({ text: 'Original', cost: 1 });
    expect(current.changed).not.toHaveBeenCalled();
  });

  it('advances a schema revision and keeps an outdated schema draft from replacing it', async () => {
    const current = database();
    const previous = current.schema();
    const saved = await current.databases.save('member', 'database', { properties: previous.properties as never, view: 'list', expectedRevision: previous.updatedAt.toISOString() });
    expect(saved.view).toBe('list');
    expect(saved.revision).not.toBe(previous.updatedAt.toISOString());
    await expect(current.databases.save('member', 'database', { properties: [], view: 'table', expectedRevision: previous.updatedAt.toISOString() })).rejects.toThrow('The database changed');
    expect(current.schema().view).toBe('list');
    expect(current.changed.mock.calls).toEqual([
      ['page-databases', { spaceId: 'space', itemId: 'database' }],
      ['page-details', { spaceId: 'space', itemId: 'database' }],
    ]);
  });

  it('does not replace an existing database through a stale conversion action', async () => {
    const current = database();
    await expect(current.databases.save('member', 'database', { properties: [], view: 'table', expectedRevision: null })).rejects.toThrow('already a database');
    expect(Object.fromEntries(current.values)).toEqual({ text: 'Original', cost: 1 });
  });

  it('compares only the properties being edited and publishes changes to the database and row', async () => {
    const current = database();
    await current.databases.setValues('member', 'row', { values: { cost: 2 }, expectedValues: { cost: 1 } });
    expect(await current.databases.setValues('member', 'row', { values: { text: 'Local draft' }, expectedValues: { text: 'Original' } })).toEqual({ values: { text: 'Local draft', cost: 2 } });
    expect(current.changed.mock.calls.slice(-2)).toEqual([
      ['page-databases', { spaceId: 'space', itemId: 'database' }],
      ['page-details', { spaceId: 'space', itemId: 'row' }],
    ]);
  });

  it('keeps newer values when a stale property edit arrives', async () => {
    const current = database();
    await current.databases.setValues('member', 'row', { values: { text: 'Remote draft' }, expectedValues: { text: 'Original' } });
    current.changed.mockClear();
    await expect(current.databases.setValues('member', 'row', { values: { text: 'Stale draft' }, expectedValues: { text: 'Original' } })).rejects.toThrow('Someone changed this property');
    expect(current.values.get('text')).toBe('Remote draft');
    expect(current.changed).not.toHaveBeenCalled();
    await expect(current.databases.setValues('member', 'row', { values: { cost: 3 }, expectedValues: {} })).rejects.toThrow('Include the previous value');
    expect(current.values.get('cost')).toBe(1);
  });
});

describe('live comment changes', () => {
  it('publishes create, edit, resolve and deletion changes only after writes succeed', async () => {
    const changed = vi.fn();
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'comment', ...data }));
    const transaction = {
      noteComment: {
        count: async () => 0,
        create: async () => ({ id: 'comment', body: 'First', author: { displayName: 'Member' } }),
        findMany: async () => [],
        findUnique: async () => ({ itemId: 'page', parentId: null, authorId: 'member' }),
        update,
        deleteMany: async () => ({ count: 1 }),
      },
      item: { findUniqueOrThrow: async () => ({ createdById: 'member' }) },
      spaceMember: { findMany: async () => [] },
      pageGrant: { findMany: async () => [] },
    };
    const comments = new NoteCommentsService(
      { ...transaction, $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction) } as never,
      { note: async () => ({ spaceId: 'space', trashedAt: null, role: SpaceRole.OWNER }) } as never,
      { notify: async () => undefined } as never,
      { notify: changed } as never,
    );
    await comments.create('member', 'page', { body: 'First' });
    await comments.update('member', 'comment', 'Edited');
    await comments.resolve('member', 'comment', true);
    await comments.remove('member', 'comment');
    expect(changed.mock.calls).toEqual(Array.from({ length: 4 }, () => ['page-comments', { spaceId: 'space', itemId: 'page' }]));
    changed.mockClear();
    update.mockRejectedValueOnce(new Error('Write failed'));
    await expect(comments.update('member', 'comment', 'Unsaved')).rejects.toThrow('Write failed');
    expect(changed).not.toHaveBeenCalled();
  });
});
