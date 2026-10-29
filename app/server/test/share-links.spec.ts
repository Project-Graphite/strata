import { ItemKind } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ShareLinksService } from '../src/share-links/share-links.service';

function service(kind: ItemKind, trashedAt: Date | null = null, database = false) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, createdAt: new Date() }));
  const documents = new Map<string, Y.Doc>();
  const read = vi.fn(async () => Buffer.from('image'));
  const audit = { record: vi.fn() };
  return {
    create,
    documents,
    read,
    links: new ShareLinksService(
      {
        item: {
          findUnique: async () => ({ kind }),
          findUniqueOrThrow: async () => ({ kind }),
          findFirst: async ({ where }: { where: { id: string; spaceId: string; kind: ItemKind; trashedAt: null } }) =>
            where.id === 'attached' && where.spaceId === 'space' && where.kind === ItemKind.FILE && where.trashedAt === null ? { id: 'attached' } : null,
        },
        itemLink: { findFirst: async () => ({ id: 'attachment' }) },
        shareLink: {
          create,
          findFirst: async () => ({ access: 'VIEW', itemId: 'page', item: { id: 'page', spaceId: 'space', kind, title: 'Shared', event: null, pollOptions: [], noteDocument: null, databaseSchema: database ? { itemId: 'page', properties: [{ id: 'secret' }], rows: [{ title: 'Private row' }] } : null } }),
        },
      } as never,
      { assertItem: async () => ({ trashedAt }) } as never,
      { link: (path: string) => `https://example.com${path}` } as never,
      { read } as never,
      { linkToken: (id: string) => id } as never,
      { hocuspocus: { documents } } as never,
      { assertPage: async () => ({ trashedAt }) } as never,
      audit as never,
    ),
    audit,
  };
}

describe('page share links', () => {
  it.each([ItemKind.NOTE, ItemKind.BOARD])('allows explicit edit links for %s', async (kind) => {
    const shared = service(kind);
    expect(await shared.links.create('member', 'page', { access: 'edit', expiresInDays: 7 })).toMatchObject({ access: 'edit', link: expect.stringContaining('/share/') });
    expect(shared.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ itemId: 'page', access: 'EDIT', createdById: 'member' }) }));
    expect(shared.audit.record).toHaveBeenCalledWith('member', 'share_link_created', { itemId: 'page', linkId: expect.any(String), access: 'edit' });
  });

  it('continues to reject edit links for events and trashed pages', async () => {
    await expect(service(ItemKind.EVENT).links.create('member', 'event', { access: 'edit' })).rejects.toThrow('Only pages and boards');
    await expect(service(ItemKind.NOTE, new Date()).links.create('member', 'page', { access: 'edit' })).rejects.toThrow('Restore this item');
  });

  it('includes the document ID for live pages and retains the existing snapshot contract', async () => {
    expect(await service(ItemKind.NOTE).links.open('code')).toEqual({
      access: 'view',
      item: { kind: 'note', title: 'Shared' },
      event: null,
      datePoll: false,
      content: { kind: 'note', id: 'page', state: null },
    });
  });

  it('identifies a body-only database share without serializing its schema or rows', async () => {
    expect((await service(ItemKind.NOTE, null, true).links.open('code')).content).toEqual({ kind: 'note', id: 'page', state: null, database: true });
  });

  it('serves newly referenced live images before link indexing and refuses unrelated or removed files', async () => {
    const shared = service(ItemKind.NOTE);
    const document = new Y.Doc();
    try {
      const image = new Y.XmlElement('image');
      image.setAttribute('fileId', 'attached');
      document.getXmlFragment('default').push([image]);
      shared.documents.set('page', document);
      expect(await shared.links.file('code', 'attached')).toEqual(Buffer.from('image'));
      await expect(shared.links.file('code', 'private')).rejects.toThrow('That file is not part of this link');
      image.setAttribute('fileId', 'cross-space');
      await expect(shared.links.file('code', 'cross-space')).rejects.toThrow('That file is not part of this link');
      document.getXmlFragment('default').delete(0, 1);
      await expect(shared.links.file('code', 'attached')).rejects.toThrow('That file is not part of this link');
      expect(shared.read).toHaveBeenCalledTimes(1);
    } finally {
      document.destroy();
    }
  });
});
