import { ItemKind, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ShareLinksService } from '../src/share-links/share-links.service';

function service(kind: ItemKind, trashedAt: Date | null = null, database = false) {
  const id = kind === ItemKind.FILE ? 'file' : 'page';
  const file = kind === ItemKind.FILE ? { originalName: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: 10 } : null;
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
          findUniqueOrThrow: async () => ({ kind, file }),
          findFirst: async ({ where }: { where: { id: string; spaceId: string; kind: ItemKind; trashedAt: null } }) =>
            where.id === 'attached' && where.spaceId === 'space' && where.kind === ItemKind.FILE && where.trashedAt === null ? { id: 'attached' } : null,
        },
        itemLink: { findFirst: async () => ({ id: 'attachment' }) },
        shareLink: {
          create,
          updateMany: async () => ({ count: 0 }),
          findFirst: async () => ({ access: 'VIEW', itemId: id, item: { id, spaceId: 'space', kind, title: 'Shared', event: null, pollOptions: [], noteDocument: null, file, databaseSchema: database ? { itemId: 'page', properties: [{ id: 'secret' }], rows: [{ title: 'Private row' }] } : null } }),
        },
      } as never,
      { assertItem: async () => ({ trashedAt }) } as never,
      { link: (path: string) => `https://example.com${path}` } as never,
      { read } as never,
      { linkToken: (id: string) => id } as never,
      { hocuspocus: { documents } } as never,
      { assertPage: async () => ({ trashedAt }) } as never,
      audit as never,
      {} as never,
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

  it('gives every link a short name, takes a custom name and lasts from 30 minutes to forever', async () => {
    const shared = service(ItemKind.NOTE);
    const brief = await shared.links.create('member', 'page', { access: 'view', expiresInMinutes: 30 });
    expect(brief).toMatchObject({ slug: expect.stringMatching(/^[a-z2-9]{8}$/), shortLink: `https://example.com/s/${brief.slug}` });
    expect(brief.expiresAt!.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(brief.expiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000);
    expect(await shared.links.create('member', 'page', { access: 'view', slug: 'team-notes', expiresInMinutes: null })).toMatchObject({
      slug: 'team-notes',
      shortLink: 'https://example.com/s/team-notes',
      expiresAt: null,
    });
    expect((await shared.links.create('member', 'page', { access: 'view' })).expiresAt!.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it('refuses a link name that is already in use', async () => {
    const shared = service(ItemKind.NOTE);
    shared.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));
    await expect(shared.links.create('member', 'page', { access: 'view', slug: 'taken' })).rejects.toThrow('That link name is taken');
  });

  it('shares and serves any file you own, but only for viewing', async () => {
    const shared = service(ItemKind.FILE);
    expect(await shared.links.create('member', 'file', { access: 'view', expiresInMinutes: null })).toMatchObject({ expiresAt: null });
    expect((await shared.links.open('code')).content).toEqual({ kind: 'file', id: 'file', name: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
    expect(await shared.links.file('code', 'file')).toEqual(Buffer.from('image'));
    await expect(shared.links.create('member', 'file', { access: 'edit' })).rejects.toThrow('Only pages and boards');
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

describe('changing a share link', () => {
  function changing(kind: ItemKind, current: { access: 'VIEW' | 'EDIT' } | null = { access: 'VIEW' }) {
    const updateMany = vi.fn(async ({ data }: { data: { access?: string } }) => {
      if (current && data.access) current.access = data.access as 'VIEW' | 'EDIT';
      return { count: current ? 1 : 0 };
    });
    const closeShareLink = vi.fn();
    const audit = { record: vi.fn() };
    const links = new ShareLinksService(
      {
        item: { findUnique: async () => ({ kind }), findUniqueOrThrow: async () => ({ kind }) },
        shareLink: {
          findFirst: async () => current && { ...current },
          updateMany,
          findUniqueOrThrow: async () => ({ id: 'link', access: current!.access, tokenHash: 'hash', slug: 'team-notes', expiresAt: null, createdAt: new Date() }),
        },
      } as never,
      { assertItem: async () => ({ trashedAt: null }) } as never,
      { link: (path: string) => `https://example.com${path}` } as never,
      {} as never,
      { linkToken: (id: string) => id } as never,
      { closeShareLink } as never,
      { assertPage: async () => ({ trashedAt: null }) } as never,
      audit as never,
      {} as never,
    );
    return { links, updateMany, closeShareLink, audit };
  }

  it.each([ItemKind.NOTE, ItemKind.BOARD])('switches a %s link between view and edit, logs it and reconnects its guests', async (kind) => {
    const shared = changing(kind);
    expect(await shared.links.update('member', 'page', 'link', { access: 'edit' })).toMatchObject({ access: 'edit', slug: 'team-notes' });
    expect(shared.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'link', itemId: 'page' }), data: { slug: undefined, access: 'EDIT' } }));
    expect(shared.audit.record).toHaveBeenCalledWith('member', 'share_link_access_changed', { itemId: 'page', linkId: 'link', access: 'edit' });
    expect(shared.closeShareLink).toHaveBeenCalledWith('link');

    expect(await shared.links.update('member', 'page', 'link', { access: 'view' })).toMatchObject({ access: 'view' });
    expect(shared.closeShareLink).toHaveBeenCalledTimes(2);
  });

  it('leaves guests connected when the access stays the same or only the name changes', async () => {
    const shared = changing(ItemKind.NOTE, { access: 'EDIT' });
    await shared.links.update('member', 'page', 'link', { access: 'edit' });
    await shared.links.update('member', 'page', 'link', { slug: 'team-notes' });
    expect(shared.audit.record).not.toHaveBeenCalled();
    expect(shared.closeShareLink).not.toHaveBeenCalled();
  });

  it('refuses edit access for anything but pages and boards, and links that are turned off', async () => {
    const file = changing(ItemKind.FILE);
    await expect(file.links.update('member', 'file', 'link', { access: 'edit' })).rejects.toThrow('Only pages and boards can be shared for editing');
    expect(file.updateMany).not.toHaveBeenCalled();
    await expect(changing(ItemKind.NOTE, null).links.update('member', 'page', 'link', { access: 'view' })).rejects.toThrow('That link is already turned off');
  });
});
