import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { ItemKind, SpaceRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { NoteVersionsService } from '../../src/notes/note-versions.service';
import { editorFormat, guestTokenPrefix, RealtimeService } from '../../src/realtime/realtime.service';
import { integrationApp, type Member } from './harness';

class TrustedSocket extends WebSocket {
  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols, { origin: 'http://localhost:4104' });
  }
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await settle(100);
  }
  return read();
}

function write(document: Y.Doc, text: string) {
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  document.getXmlFragment('default').push([paragraph]);
}

const textOf = (document: Y.Doc) => document.getXmlFragment('default').toString();

describe('Notes and real-time editing against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;
  const providers: HocuspocusProvider[] = [];

  afterEach(() => {
    for (const provider of providers.splice(0)) provider.destroy();
  });

  it('recovers large formatted page and board drafts into new authorized items', async () => {
    const owner = await member('draft-recovery');
    const outsider = await member('draft-outsider');
    const original = new Y.Doc();
    const heading = new Y.XmlElement('heading');
    heading.setAttribute('id', 'recovered-heading');
    heading.setAttribute('level', 2 as never);
    heading.insert(0, [new Y.XmlText('Recovered heading')]);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Large draft '.repeat(250_000))]);
    original.getXmlFragment('default').push([heading, paragraph]);
    const draft = { type: 'strata-page', version: 1, format: editorFormat, kind: 'note', title: 'Recovered title', state: Buffer.from(Y.encodeStateAsUpdate(original)).toString('base64') };
    const recover = async (as: Member, content: unknown, type = 'application/octet-stream') => {
      const response = await fetch(`${strata.base}/spaces/${owner.personalSpaceId}/page-drafts`, { method: 'POST', headers: { Authorization: `Bearer ${as.token}`, 'Content-Type': type }, body: JSON.stringify(content) });
      return { status: response.status, body: await response.json() };
    };
    const recovered = await recover(owner, draft);
    expect(recovered.status).toBe(201);
    expect(recovered.body).toMatchObject({ title: 'Recovered title', kind: 'note' });
    const copy = new Y.Doc();
    Y.applyUpdate(copy, new Uint8Array((await strata.prisma.noteDocument.findUniqueOrThrow({ where: { itemId: recovered.body.id } })).state));
    expect(textOf(copy)).toBe(textOf(original));
    expect((await recover(outsider, draft)).status).toBe(404);
    expect((await recover(owner, { ...draft, state: 'broken' })).status).toBe(400);
    expect((await recover(owner, { ...draft, format: editorFormat + 1 })).status).toBe(400);
    expect((await recover(owner, { ...draft, state: '' }, 'application/json')).status).toBe(400);
    original.getMap('board').set('shape', { id: 'shape', type: 'rectangle', x: 10, y: 20, version: 1 });
    const board = await recover(owner, { ...draft, kind: 'board', state: Buffer.from(Y.encodeStateAsUpdate(original)).toString('base64') });
    expect(board.status).toBe(201);
    expect(board.body.kind).toBe('board');
    expect((await owner.call('GET', `/notes/${board.body.id}/board`)).body.elements).toEqual([{ id: 'shape', type: 'rectangle', x: 10, y: 20, version: 1 }]);
    expect((await owner.call('GET', `/notes/${board.body.id}/board/thumbnail`)).body.thumbnail).toContain('<rect x="10" y="20"');
    expect((await strata.prisma.noteDocument.findUniqueOrThrow({ where: { itemId: board.body.id } })).thumbnail).toContain('<rect x="10" y="20"');
    expect(board.body.id).not.toBe(recovered.body.id);
    original.destroy();
    copy.destroy();
  });

  it('deduplicates concurrent recovery retries and keeps existing pages unchanged', async () => {
    const owner = await member('recovery-retries');
    const stranger = await member('recovery-retries-stranger');
    const document = new Y.Doc();
    write(document, 'Original recovered content');
    const draft = { type: 'strata-page', version: 1, format: editorFormat, kind: 'note', title: 'Recovered once', state: Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64') };
    const id = randomUUID();
    const recover = async (as: Member, recoveryId: string, content = draft) => {
      const response = await fetch(`${strata.base}/spaces/${owner.personalSpaceId}/page-drafts`, { method: 'POST', headers: { Authorization: `Bearer ${as.token}`, 'Content-Type': 'application/octet-stream', 'X-Recovery-Id': recoveryId }, body: JSON.stringify(content) });
      return { status: response.status, body: await response.json() };
    };
    const replies = await Promise.all([recover(owner, id), recover(owner, id)]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    expect(replies.map((reply) => reply.body.id)).toEqual([id, id]);
    expect(await strata.prisma.item.count({ where: { spaceId: owner.personalSpaceId, kind: ItemKind.NOTE } })).toBe(1);
    const before = await strata.prisma.noteDocument.findUniqueOrThrow({ where: { itemId: id } });
    write(document, 'Do not overwrite a recovered page on retry');
    const picture = await strata.item(owner.personalSpaceId, 'retry.png', ItemKind.FILE);
    const image = new Y.XmlElement('image');
    image.setAttribute('fileId', picture.id);
    document.getXmlFragment('default').push([image]);
    expect((await recover(owner, id, { ...draft, title: 'Changed file', state: Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64') })).body.title).toBe('Recovered once');
    expect(Buffer.compare(Buffer.from((await strata.prisma.noteDocument.findUniqueOrThrow({ where: { itemId: id } })).state), Buffer.from(before.state))).toBe(0);
    expect(await strata.prisma.itemLink.count({ where: { sourceItemId: id } })).toBe(0);
    expect((await recover(owner, 'invalid')).status).toBe(400);
    expect((await recover(stranger, id)).status).toBe(404);
    await strata.join(owner.personalSpaceId, stranger, SpaceRole.EDITOR);
    expect((await recover(stranger, id)).status).toBe(409);
    const elsewhere = (await owner.call('POST', '/spaces', { name: 'Other recovery space' })).body;
    const otherPage = (await owner.call('POST', `/spaces/${elsewhere.id}/notes`, { title: 'Other page' })).body;
    expect((await recover(owner, otherPage.id)).status).toBe(409);
    document.destroy();
  });

  it('serializes reciprocal moves and calculates sibling placement against committed data', async () => {
    const owner = await member('tree-moves');
    const first = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'First' })).body;
    const second = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Second' })).body;
    const moved = await Promise.all([
      owner.call('PATCH', `/notes/${first.id}`, { parentId: second.id }),
      owner.call('PATCH', `/notes/${second.id}`, { parentId: first.id }),
    ]);
    expect(moved.map((reply) => reply.status).sort()).toEqual([200, 400]);
    const rows = await strata.prisma.note.findMany({ where: { itemId: { in: [first.id, second.id] } } });
    expect(rows.filter((row) => row.parentId === null)).toHaveLength(1);
    expect((await owner.call('PATCH', `/notes/${first.id}`, { parentId: null })).status).toBe(200);
    expect((await owner.call('PATCH', `/notes/${second.id}`, { parentId: null })).status).toBe(200);
    expect((await owner.call('PATCH', `/notes/${second.id}`, { relativeTo: first.id, placement: 'before' })).status).toBe(200);
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/page-children`)).body.pages.map((page: { id: string }) => page.id)).toEqual([second.id, first.id]);
    const renamedAndMoved = await Promise.all([
      owner.call('PATCH', `/notes/${first.id}`, { title: 'Renamed', expectedTitle: 'First' }),
      owner.call('PATCH', `/notes/${second.id}`, { relativeTo: first.id, placement: 'after' }),
    ]);
    expect(renamedAndMoved.map((reply) => reply.status)).toEqual([200, 200]);
  });

  it('surfaces children of hidden parents and keeps navigation, moves and cycle checks consistent', async () => {
    const owner = await member('hidden-page-parent');
    const root = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Root page' })).body;
    const parent = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Hidden parent' })).body;
    const first = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'First child', parentId: parent.id })).body;
    const second = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Second child', parentId: parent.id })).body;
    const nested = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Nested child', parentId: first.id })).body;
    const roots = async () => (await owner.call('GET', `/spaces/${owner.personalSpaceId}/page-children`)).body.pages.map((page: { id: string }) => page.id);
    expect((await owner.call('POST', `/items/${parent.id}/trash`)).status).toBe(204);
    expect(await roots()).toEqual(expect.arrayContaining([root.id, first.id, second.id]));
    expect(await roots()).not.toContain(parent.id);
    expect((await owner.call('GET', `/notes/${first.id}`)).body.path).toEqual([]);
    expect((await owner.call('GET', `/notes/${nested.id}`)).body.path).toEqual([{ id: first.id, title: 'First child' }]);
    await strata.prisma.note.update({ where: { itemId: second.id }, data: { position: 1_000 } });
    const appended = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Appended after visible roots' })).body;
    expect((await roots()).at(-1)).toBe(appended.id);
    expect((await owner.call('PATCH', `/notes/${first.id}`, { relativeTo: root.id, placement: 'before' })).body.parentId).toBeNull();
    expect((await owner.call('PATCH', `/notes/${root.id}`, { relativeTo: second.id, placement: 'after' })).body.parentId).toBeNull();
    expect((await owner.call('POST', `/items/${parent.id}/restore`)).status).toBe(204);
    expect(await roots()).not.toContain(second.id);
    expect((await owner.call('GET', `/notes/${second.id}`)).body.path).toEqual([{ id: parent.id, title: 'Hidden parent' }]);
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/page-children?parentId=${parent.id}`)).body.pages.map((page: { id: string }) => page.id)).toEqual([second.id]);
    expect((await owner.call('PATCH', `/notes/${parent.id}`, { template: true })).status).toBe(200);
    expect(await roots()).toContain(second.id);
    expect((await owner.call('GET', `/notes/${second.id}`)).body.path).toEqual([]);
    expect((await owner.call('PATCH', `/notes/${parent.id}`, { parentId: second.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${root.id}`, { relativeTo: second.id, placement: 'before' })).body.parentId).toBeNull();
    expect((await owner.call('PATCH', `/notes/${parent.id}`, { template: false })).status).toBe(200);
    await strata.prisma.item.update({ where: { id: parent.id }, data: { archivedAt: new Date() } });
    expect(await roots()).toContain(second.id);
    expect((await owner.call('GET', `/notes/${second.id}`)).body.path).toEqual([]);
    await strata.prisma.item.update({ where: { id: parent.id }, data: { archivedAt: null } });
    expect(await roots()).not.toContain(second.id);
  });

  it('paginates more than five hundred roots and retrieves old children without flattening them', async () => {
    const owner = await member('large-page-tree');
    const ids = Array.from({ length: 602 }, () => randomUUID());
    await strata.prisma.item.createMany({ data: ids.map((id, index) => ({ id, kind: ItemKind.NOTE, title: `Page ${index}`, spaceId: owner.personalSpaceId, createdById: owner.id, updatedAt: new Date(1_000 + index) })) });
    await strata.prisma.note.createMany({ data: ids.map((itemId, index) => ({ itemId, position: index, parentId: index === 601 ? ids[0] : null })) });
    const listed: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await owner.call('GET', `/spaces/${owner.personalSpaceId}/page-children${cursor ? `?cursor=${cursor}` : ''}`);
      expect(response.status).toBe(200);
      expect(response.body.nextPage?.id ?? null).toBe(listed.length + 100 < 601 ? ids[listed.length + 100] : null);
      listed.push(...response.body.pages.map((page: { id: string }) => page.id));
      cursor = response.body.nextCursor;
    } while (cursor);
    expect(listed).toEqual(ids.slice(0, 601));
    expect((await owner.call('PATCH', `/notes/${ids[99]}`, { relativeTo: ids[100], placement: 'after' })).status).toBe(200);
    const moved = (await owner.call('GET', `/spaces/${owner.personalSpaceId}/page-children`)).body;
    expect(moved.pages.at(-1).id).toBe(ids[100]);
    expect(moved.nextPage.id).toBe(ids[99]);
    expect((await owner.call('PATCH', `/notes/${ids[99]}`, { relativeTo: ids[100], placement: 'before' })).status).toBe(200);
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/page-children?cursor=${ids[99]}`)).body.pages[0].id).toBe(ids[100]);
    expect((await owner.call('GET', `/spaces/${owner.personalSpaceId}/page-children?parentId=${ids[0]}`)).body.pages.map((page: { id: string }) => page.id)).toEqual([ids[601]]);
    const outsider = await member('tree-outsider');
    expect((await outsider.call('GET', `/spaces/${owner.personalSpaceId}/page-children`)).status).toBe(404);
  });

  function open(as: Member | string, name: string, format = editorFormat) {
    const document = new Y.Doc();
    const websocketProvider = new HocuspocusProviderWebsocket({
      url: `${strata.base.replace(/^http/, 'ws')}/api/v1/realtime?format=${format}`,
      WebSocketPolyfill: TrustedSocket,
    });
    return new Promise<{ provider: HocuspocusProvider; document: Y.Doc }>((resolve, reject) => {
      const provider: HocuspocusProvider = new HocuspocusProvider({
        name,
        token: typeof as === 'string' ? as : as.token,
        document,
        websocketProvider,
        onSynced: (): void => resolve({ provider, document }),
        onAuthenticationFailed: ({ reason }) => reject(new Error(reason)),
      });
      provider.attach();
      providers.push(provider);
    });
  }

  it('keeps a page tree inside one space and refuses loops and viewers', async () => {
    const owner = await member('writer');
    const viewer = await member('glancer');
    const space = (await owner.call('POST', '/spaces', { name: 'Journal' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);

    const parent = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Trips' })).body;
    const child = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Lisbon', parentId: parent.id })).body;
    const grandchild = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Food', parentId: child.id })).body;
    expect(child).toMatchObject({ parentId: parent.id, position: 1 });

    expect((await owner.call('GET', `/notes/${grandchild.id}`)).body).toMatchObject({
      editable: true,
      path: [
        { id: parent.id, title: 'Trips' },
        { id: child.id, title: 'Lisbon' },
      ],
    });
    expect((await owner.call('PATCH', `/notes/${parent.id}`, { parentId: grandchild.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${parent.id}`, { parentId: parent.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/notes`, { parentId: (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, {})).body.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${child.id}`, { title: 'Lisbon 2027', parentId: null, icon: '🌍', pinned: true })).body).toMatchObject({
      title: 'Lisbon 2027',
      parentId: null,
      icon: '🌍',
    });

    expect((await viewer.call('GET', `/spaces/${space.id}/notes`)).body.map((note: { title: string }) => note.title)).toEqual(['Trips', 'Food', 'Lisbon 2027']);
    expect((await viewer.call('GET', `/notes/${parent.id}`)).body.editable).toBe(false);
    expect((await viewer.call('POST', `/spaces/${space.id}/notes`, { title: 'Mine' })).status).toBe(403);
    expect((await viewer.call('PATCH', `/notes/${parent.id}`, { title: 'Mine' })).status).toBe(403);
  });

  it('keeps notes apart from pages, refuses nesting and turns a note into a page', async () => {
    const owner = await member('jotter');
    const space = (await owner.call('POST', '/spaces', { name: 'Scribbles' })).body;
    const page = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Plans' })).body;
    const note = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Call the landlord', text: 'About the boiler', quick: true })).body;
    expect(note).toMatchObject({ quick: true, parentId: null });

    expect((await owner.call('POST', `/spaces/${space.id}/notes`, { quick: true, parentId: page.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/notes`, { parentId: note.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${page.id}`, { parentId: note.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${note.id}`, { template: true })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${note.id}`, { icon: '📝' })).status).toBe(400);
    expect((await owner.call('PUT', `/notes/${note.id}/database`, { properties: [], view: 'table' })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${page.id}`, { quick: true })).status).toBe(400);

    const ids = (listed: { id: string }[]) => listed.map((shown) => shown.id);
    expect(ids((await owner.call('GET', '/me/notes?kind=quick')).body)).toEqual([note.id]);
    expect(ids((await owner.call('GET', '/me/notes?kind=note')).body)).toEqual([page.id]);
    expect(ids((await owner.call('GET', `/spaces/${space.id}/notes`)).body)).toEqual([page.id]);
    expect(ids((await owner.call('GET', '/me/pages')).body.recent)).toEqual([page.id]);

    expect((await owner.call('PATCH', `/notes/${note.id}`, { quick: false })).body).toMatchObject({ quick: false });
    expect(ids((await owner.call('GET', '/me/notes?kind=quick')).body)).toEqual([]);
    expect(ids((await owner.call('GET', `/spaces/${space.id}/notes`)).body)).toEqual([page.id, note.id]);
  });

  it('syncs edits between people, saves them, feeds search and drops a viewer’s changes', async () => {
    const owner = await member('cowriter');
    const friend = await member('friend');
    const viewer = await member('onlooker');
    const outsider = await member('stranger');
    const space = (await owner.call('POST', '/spaces', { name: 'Plans' })).body;
    await strata.join(space.id, friend, SpaceRole.EDITOR);
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const note = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Packing' })).body;

    const mine = await open(owner, note.id);
    const theirs = await open(friend, note.id);
    const watching = await open(viewer, note.id);
    write(mine.document, 'Passport and charger');
    await until(async () => textOf(theirs.document), (text) => text.includes('Passport and charger'));
    expect(textOf(theirs.document)).toContain('Passport and charger');

    write(watching.document, 'Viewer scribble');
    await settle(500);
    expect(textOf(mine.document)).not.toContain('Viewer scribble');
    expect(textOf(strata.service(RealtimeService).hocuspocus.documents.get(note.id)!)).not.toContain('Viewer scribble');

    strata.service(RealtimeService).hocuspocus.flushPendingStores();
    const stored = await until(
      () => strata.prisma.searchDocument.findUnique({ where: { itemId: note.id } }),
      (row) => Boolean(row?.bodyText.includes('Passport and charger')),
    );
    expect(stored?.bodyText).toBe('Passport and charger');
    expect(await strata.prisma.noteDocument.count({ where: { itemId: note.id } })).toBe(1);
    const found = (await owner.call('GET', '/search?q=charger')).body;
    expect(found.items.map((result: { id: string }) => result.id)).toContain(note.id);

    await expect(open(outsider, note.id)).rejects.toThrow();
    await expect(open(friend, note.id, editorFormat - 1)).rejects.toThrow('outdated');
  });

  it('refuses other origins and disconnects someone who lost access', async () => {
    const owner = await member('host');
    const guest = await member('guest');
    const space = (await owner.call('POST', '/spaces', { name: 'Shared' })).body;
    await strata.join(space.id, guest, SpaceRole.EDITOR);
    const note = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Ideas' })).body;

    const refused = await new Promise<number>((resolve) => {
      const socket = new WebSocket(`${strata.base.replace(/^http/, 'ws')}/api/v1/realtime`, { origin: 'https://evil.example' });
      socket.on('error', () => undefined);
      socket.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode ?? 0);
        socket.terminate();
      });
      socket.on('open', () => resolve(101));
    });
    expect(refused).toBe(403);

    await open(guest, note.id);
    const realtime = strata.service(RealtimeService);
    const connections = () => [...(realtime.hocuspocus.documents.get(note.id)?.connections.keys() ?? [])].length;
    expect(connections()).toBe(1);
    await strata.prisma.spaceMember.delete({ where: { spaceId_userId: { spaceId: space.id, userId: guest.id } } });
    await realtime.recheckAccess();
    expect(await until(async () => connections(), (count) => count === 0)).toBe(0);
  });

  it('disconnects a device once its sign-in has ended, and closes a page that grew past the size limit', async () => {
    const owner = await member('novelist');
    const note = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Long read' })).body;
    const realtime = strata.service(RealtimeService);
    const connections = () => [...(realtime.hocuspocus.documents.get(note.id)?.connections.keys() ?? [])].length;

    const opened = await open(owner, note.id);
    await realtime.recheckAccess();
    expect(connections()).toBe(1);
    for (let part = 0; part < 4; part += 1) {
      write(opened.document, `${part}${'x'.repeat(1_500_000)}`);
      await settle(200);
    }
    await until(async () => textOf(realtime.hocuspocus.documents.get(note.id)!).length, (length) => length > 6_000_000);
    realtime.hocuspocus.flushPendingStores();
    expect(await until(async () => connections(), (count) => count === 0)).toBe(0);
    expect(await strata.prisma.noteDocument.count({ where: { itemId: note.id } })).toBe(0);

    await open(owner, note.id);
    expect(connections()).toBe(1);
    await strata.prisma.refreshSession.deleteMany({ where: { userId: owner.id } });
    await realtime.recheckAccess();
    expect(await until(async () => connections(), (count) => count === 0)).toBe(0);
  });

  it('keeps boards in the page tree, syncs their elements, indexes their text and restores them', async () => {
    const owner = await member('sketcher');
    const friend = await member('doodler');
    const space = (await owner.call('POST', '/spaces', { name: 'Wedding' })).body;
    await strata.join(space.id, friend, SpaceRole.EDITOR);
    const board = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Seating', board: true })).body;
    expect(board).toMatchObject({ kind: 'board', title: 'Seating' });
    expect((await owner.call('GET', `/spaces/${space.id}/notes`)).body).toEqual([expect.objectContaining({ id: board.id, kind: 'board' })]);
    const page = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Menu' })).body;
    expect((await friend.call('GET', '/me/notes?kind=board')).body.map((found: { id: string }) => found.id)).toEqual([board.id]);
    expect((await friend.call('GET', '/me/notes?kind=note')).body.map((found: { id: string }) => found.id)).toEqual([page.id]);
    expect((await owner.call('GET', '/me/notes?kind=task')).status).toBe(400);
    expect((await friend.call('GET', '/me/notes')).body.map((found: { id: string }) => found.id).sort()).toEqual([board.id, page.id].sort());
    expect((await owner.call('POST', `/spaces/${space.id}/notes`, { board: true, template: 'meeting' })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${board.id}`, { template: true })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space.id}/notes`, { parentId: board.id })).status).toBe(400);
    expect((await owner.call('PUT', `/notes/${board.id}/database`, { properties: [], view: 'table' })).status).toBe(404);
    const realtime = strata.service(RealtimeService);
    const elementsOf = (document: Y.Doc) => document.getMap<{ id: string; text?: string; version: number; isDeleted?: boolean }>('board');

    const mine = await open(owner, board.id);
    const theirs = await open(friend, board.id);
    elementsOf(mine.document).set('table-1', { id: 'table-1', type: 'text', text: 'Top table', version: 3 });
    await until(async () => elementsOf(theirs.document).get('table-1'), (element) => Boolean(element));
    expect(elementsOf(theirs.document).get('table-1')).toMatchObject({ text: 'Top table' });
    realtime.hocuspocus.flushPendingStores();
    const stored = await until(
      () => strata.prisma.searchDocument.findUnique({ where: { itemId: board.id } }),
      (row) => Boolean(row?.bodyText.includes('Top table')),
    );
    expect(stored?.bodyText).toBe('Top table');
    expect((await friend.call('GET', `/notes/${board.id}/board`)).body.elements).toEqual([expect.objectContaining({ id: 'table-1', text: 'Top table' })]);
    expect((await friend.call('GET', `/notes/${page.id}/board`)).status).toBe(404);
    expect((await friend.call('GET', `/notes/${board.id}/board/thumbnail`)).body.thumbnail).toContain('>Top table</tspan>');
    expect((await friend.call('GET', `/notes/${page.id}/board/thumbnail`)).status).toBe(404);

    theirs.provider.destroy();
    mine.provider.destroy();
    const [version] = await until(
      async () => (await owner.call('GET', `/notes/${board.id}/versions`)).body as { id: string }[],
      (versions) => versions.length === 1,
    );
    const again = await open(owner, board.id);
    elementsOf(again.document).set('table-1', { id: 'table-1', type: 'text', text: 'Top table moved', version: 9 });
    elementsOf(again.document).set('table-2', { id: 'table-2', type: 'text', text: 'Kids table', version: 1 });
    await until(async () => elementsOf(realtime.hocuspocus.documents.get(board.id)!).size, (size) => size === 2);
    expect((await owner.call('POST', `/notes/${board.id}/versions/${version!.id}/restore`)).status).toBe(204);
    await until(async () => elementsOf(again.document).get('table-1')?.text, (text) => text === 'Top table');
    expect(elementsOf(again.document).get('table-1')).toMatchObject({ text: 'Top table', version: 10, isDeleted: false });
    expect(elementsOf(again.document).get('table-2')).toMatchObject({ text: 'Kids table', version: 2, isDeleted: true });
  });

  it('keeps versions when editing sessions end, previews and restores them, and thins old ones', async () => {
    const owner = await member('historian');
    const viewer = await member('reviewer');
    const space = (await owner.call('POST', '/spaces', { name: 'Drafts' })).body;
    await strata.join(space.id, viewer, SpaceRole.VIEWER);
    const note = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Speech' })).body;
    const realtime = strata.service(RealtimeService);

    const first = await open(owner, note.id);
    write(first.document, 'First draft');
    await settle(300);
    first.provider.destroy();
    const listed = await until(
      async () => (await owner.call('GET', `/notes/${note.id}/versions`)).body as { id: string; createdBy: string }[],
      (versions) => versions.length === 1,
    );
    expect(listed).toEqual([expect.objectContaining({ createdBy: 'historian' })]);
    expect((await owner.call('GET', `/notes/${note.id}/versions/${listed[0]!.id}`)).body.text).toBe('First draft');

    const second = await open(owner, note.id);
    write(second.document, 'Second paragraph');
    await until(async () => textOf(realtime.hocuspocus.documents.get(note.id)!), (text) => text.includes('Second paragraph'));
    realtime.hocuspocus.flushPendingStores();
    await settle(300);
    expect((await owner.call('GET', `/notes/${note.id}/versions`)).body).toHaveLength(1);

    expect((await viewer.call('GET', `/notes/${note.id}/versions`)).status).toBe(200);
    expect((await viewer.call('POST', `/notes/${note.id}/versions/${listed[0]!.id}/restore`)).status).toBe(403);
    expect((await owner.call('POST', `/notes/${note.id}/versions/${listed[0]!.id}/restore`)).status).toBe(204);
    await until(async () => textOf(second.document), (text) => !text.includes('Second paragraph'));
    expect(textOf(second.document)).toContain('First draft');
    expect(textOf(second.document)).not.toContain('Second paragraph');
    const afterRestore = (await owner.call('GET', `/notes/${note.id}/versions`)).body as { id: string }[];
    expect(afterRestore).toHaveLength(2);
    expect((await owner.call('GET', `/notes/${note.id}/versions/${afterRestore[0]!.id}`)).body.text).toBe('First draft\nSecond paragraph');

    const now = new Date('2026-10-05T12:00:00Z');
    const at = (daysAgo: number, hour: number) => new Date(Date.UTC(2026, 9, 5 - daysAgo, hour));
    const state = Buffer.from(Y.encodeStateAsUpdate(new Y.Doc()));
    await strata.prisma.noteVersion.deleteMany({ where: { itemId: note.id } });
    await strata.prisma.noteVersion.createMany({
      data: [at(1, 9), at(1, 10), at(10, 9), at(10, 15), at(120, 9), at(118, 9), at(115, 9)].map((createdAt) => ({ itemId: note.id, state, createdAt })),
    });
    await strata.service(NoteVersionsService).thin(now);
    const kept = await strata.prisma.noteVersion.findMany({ where: { itemId: note.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    expect(kept.map(({ createdAt }) => createdAt.toISOString())).toEqual(
      [at(120, 9), at(115, 9), at(10, 15), at(1, 9), at(1, 10)].map((date) => date.toISOString()),
    );
  });

  it('shows a shared page or board to guests, with only the images they contain', async () => {
    const owner = await member('sharer');
    const note = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Recipe' })).body;
    const board = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Plan', board: true })).body;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const shown = (await (await strata.upload(owner, owner.personalSpaceId, 'cake.png', png)).json()).id;
    const unrelated = (await (await strata.upload(owner, owner.personalSpaceId, 'secret.png', png)).json()).id;
    const realtime = strata.service(RealtimeService);

    const page = await open(owner, note.id);
    const image = new Y.XmlElement('image');
    image.setAttribute('fileId', shown);
    write(page.document, 'Two eggs');
    page.document.getXmlFragment('default').push([image]);
    const drawing = await open(owner, board.id);
    drawing.document.getMap('board').set('box', { id: 'box', type: 'rectangle', version: 1 });
    await until(async () => realtime.hocuspocus.documents.get(note.id)!.getXmlFragment('default').length, (length) => length === 2);
    realtime.hocuspocus.flushPendingStores();
    await until(() => strata.prisma.itemLink.count({ where: { sourceItemId: note.id, targetItemId: shown } }), (count) => count === 1);
    await until(() => strata.prisma.noteDocument.count({ where: { itemId: board.id } }), (count) => count === 1);

    const code = async (itemId: string) => (await owner.call('POST', `/items/${itemId}/share-links`, { access: 'view' })).body.link.split('/share/')[1];
    const pageCode = await code(note.id);
    const shared = (await strata.anonymous('GET', `/share/${pageCode}`)).body;
    expect(shared.content.kind).toBe('note');
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Buffer.from(shared.content.state, 'base64'));
    expect(textOf(copy)).toContain('Two eggs');
    expect((await strata.anonymous('GET', `/share/${await code(board.id)}`)).body.content).toEqual({ kind: 'board', id: board.id });

    const guestFile = await fetch(`${strata.base}/share/${pageCode}/files/${shown}`);
    expect(guestFile.status).toBe(200);
    expect(guestFile.headers.get('content-type')).toBe('image/png');
    expect((await fetch(`${strata.base}/share/${pageCode}/files/${unrelated}`)).status).toBe(404);
    expect((await fetch(`${strata.base}/share/${pageCode}/files/not-a-file`)).status).toBe(400);
  });

  it('lets guests watch a shared board live, and edit it only through an edit link', async () => {
    const owner = await member('facilitator');
    const board = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Retro', board: true })).body;
    const page = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Minutes' })).body;
    const realtime = strata.service(RealtimeService);
    const elementsOf = (document: Y.Doc) => document.getMap<{ id: string; text?: string; version: number }>('board');
    const share = async (itemId: string, access: 'view' | 'edit') => (await owner.call('POST', `/items/${itemId}/share-links`, { access })).body as { id: string; link: string };
    const guestToken = (link: { link: string }) => `${guestTokenPrefix}${link.link.split('/share/')[1]}`;
    const viewLink = await share(board.id, 'view');
    const editLink = await share(board.id, 'edit');
    expect((await owner.call('POST', `/items/${page.id}/share-links`, { access: 'edit' })).status).toBe(201);

    const host = await open(owner, board.id);
    const watcher = await open(guestToken(viewLink), board.id);
    const editor = await open(guestToken(editLink), board.id);
    elementsOf(host.document).set('went-well', { id: 'went-well', type: 'text', text: 'Shipped on time', version: 1 });
    await until(async () => elementsOf(watcher.document).get('went-well'), Boolean);
    expect(elementsOf(watcher.document).get('went-well')).toMatchObject({ text: 'Shipped on time' });

    elementsOf(editor.document).set('to-change', { id: 'to-change', type: 'text', text: 'Fewer meetings', version: 1 });
    await until(async () => elementsOf(host.document).get('to-change'), Boolean);
    expect(elementsOf(host.document).get('to-change')).toMatchObject({ text: 'Fewer meetings' });
    elementsOf(watcher.document).set('sneaky', { id: 'sneaky', type: 'text', text: 'Read only', version: 1 });
    await settle();
    expect(elementsOf(realtime.hocuspocus.documents.get(board.id)!).has('sneaky')).toBe(false);

    await expect(open(guestToken(viewLink), page.id)).rejects.toThrow();
    await expect(open(`${guestTokenPrefix}${'x'.repeat(43)}`, board.id)).rejects.toThrow();
    const connections = () => [...(realtime.hocuspocus.documents.get(board.id)?.connections.keys() ?? [])].length;
    expect(connections()).toBe(3);
    expect((await owner.call('DELETE', `/items/${board.id}/share-links/${editLink.id}`)).status).toBe(204);
    expect(await until(async () => connections(), (count) => count === 2)).toBe(2);
    await strata.prisma.shareLink.update({ where: { id: viewLink.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await realtime.recheckAccess();
    expect(await until(async () => connections(), (count) => count === 1)).toBe(1);
  });

  it('turns mentions and images into links, and never links what the writer cannot read', async () => {
    const owner = await member('linker');
    const stranger = await member('private');
    const note = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Hub' })).body;
    const target = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Target' })).body;
    const hidden = (await stranger.call('POST', `/spaces/${stranger.personalSpaceId}/notes`, { title: 'Hidden' })).body;
    const picture = await strata.item(owner.personalSpaceId, 'photo.png', ItemKind.FILE);
    const realtime = strata.service(RealtimeService);

    const editing = await open(owner, note.id);
    const paragraph = new Y.XmlElement('paragraph');
    const mention = new Y.XmlElement('mention');
    mention.setAttribute('id', target.id);
    const secret = new Y.XmlElement('mention');
    secret.setAttribute('id', hidden.id);
    paragraph.insert(0, [new Y.XmlText('See '), mention, secret]);
    const image = new Y.XmlElement('image');
    image.setAttribute('fileId', picture.id);
    editing.document.getXmlFragment('default').push([paragraph, image]);
    const links = () => strata.prisma.itemLink.findMany({ where: { sourceItemId: note.id }, orderBy: { kind: 'asc' }, select: { kind: true, targetItemId: true } });

    await until(async () => textOf(realtime.hocuspocus.documents.get(note.id)!), (text) => text.includes('mention'));
    realtime.hocuspocus.flushPendingStores();
    expect(await until(links, (rows) => rows.length === 2)).toEqual([
      { kind: 'MENTION', targetItemId: target.id },
      { kind: 'ATTACHMENT', targetItemId: picture.id },
    ]);
    expect((await owner.call('GET', `/items/${target.id}/links`)).body.backlinks).toEqual([expect.objectContaining({ kind: 'mention', item: expect.objectContaining({ id: note.id }) })]);

    editing.document.transact(() => paragraph.delete(1, 2));
    await until(async () => textOf(realtime.hocuspocus.documents.get(note.id)!), (text) => !text.includes('mention'));
    realtime.hocuspocus.flushPendingStores();
    expect(await until(links, (rows) => rows.length === 1)).toEqual([{ kind: 'ATTACHMENT', targetItemId: picture.id }]);
  });

  it('lists my pinned and recently edited pages across spaces, without templates, trash or other people’s spaces', async () => {
    const reader = await member('bookworm');
    const stranger = await member('outsider-pages');
    const club = (await reader.call('POST', '/spaces', { name: 'Book club' })).body;
    const create = async (as: Member, spaceId: string, title: string) => (await as.call('POST', `/spaces/${spaceId}/notes`, { title })).body as { id: string };
    const pinned = await create(reader, club.id, 'Reading list');
    await create(reader, reader.personalSpaceId, 'Diary');
    const template = await create(reader, reader.personalSpaceId, 'Meeting template');
    const trashed = await create(reader, reader.personalSpaceId, 'Old draft');
    await create(stranger, stranger.personalSpaceId, 'Not yours');
    await reader.call('PATCH', `/notes/${pinned.id}`, { pinned: true });
    await reader.call('PATCH', `/notes/${template.id}`, { template: true });
    await reader.call('POST', `/items/${trashed.id}/trash`);

    const listed = (await reader.call('GET', '/me/pages')).body;
    expect(listed.pinned.map((page: { title: string }) => page.title)).toEqual(['Reading list']);
    expect(listed.recent.map((page: { title: string }) => page.title)).toEqual(['Diary']);
  });

  it('starts pages from built-in templates, space templates or captured text', async () => {
    const owner = await member('templater');
    const space = owner.personalSpaceId;
    const stored = async (id: string) => {
      const row = await strata.prisma.noteDocument.findUnique({ where: { itemId: id } });
      const document = new Y.Doc();
      if (row) Y.applyUpdate(document, new Uint8Array(row.state));
      return document;
    };

    const meeting = (await owner.call('POST', `/spaces/${space}/notes`, { title: 'Standup', template: 'meeting' })).body;
    const meetingDocument = await stored(meeting.id);
    expect(textOf(meetingDocument)).toContain('<heading level="2">Attendees</heading>');
    expect(textOf(meetingDocument)).toContain('<tasklist><taskitem checked="false"><paragraph></paragraph></taskitem></tasklist>');
    expect((await owner.call('POST', `/spaces/${space}/notes`, { template: 'diary' })).status).toBe(400);

    const captured = (await owner.call('POST', `/spaces/${space}/notes`, { text: 'Call the bank\nAsk about fees' })).body;
    expect((await strata.prisma.searchDocument.findUnique({ where: { itemId: captured.id } }))?.bodyText).toBe('Call the bank\nAsk about fees');

    expect((await owner.call('POST', `/spaces/${space}/notes`, { fromNoteId: captured.id })).status).toBe(400);
    expect((await owner.call('PATCH', `/notes/${captured.id}`, { template: true })).body.template).toBe(true);
    const copy = (await owner.call('POST', `/spaces/${space}/notes`, { title: 'Copy', fromNoteId: captured.id })).body;
    expect(copy.template).toBe(false);
    expect(textOf(await stored(copy.id))).toBe(textOf(await stored(captured.id)));

    const elsewhere = await member('borrower');
    expect((await elsewhere.call('POST', `/spaces/${elsewhere.personalSpaceId}/notes`, { fromNoteId: captured.id })).status).toBe(400);
  });

  it('keeps direct page access separate from parents, children, space membership and unrelated resources', async () => {
    const owner = await member('grant-owner');
    const recipient = await member('grant-recipient');
    const parent = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Private parent' })).body;
    const note = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Sharedquartz', parentId: parent.id })).body;
    const child = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Private child', parentId: note.id })).body;
    const task = await strata.item(owner.personalSpaceId, 'Private task', ItemKind.TASK);
    expect((await owner.call('POST', `/items/${parent.id}/links`, { targetId: note.id, kind: 'mention' })).status).toBe(201);
    expect((await recipient.call('GET', `/notes/${note.id}`)).status).toBe(404);
    expect((await owner.call('PUT', `/notes/${note.id}/people`, { email: recipient.email, role: 'view' })).status).toBe(200);
    expect((await recipient.call('GET', `/notes/${note.id}`)).body).toMatchObject({ parentId: null, path: [], editable: false, row: null, permissions: { comment: false, share: false, organize: false, history: false, pageRole: 'view', spaceRole: null } });
    for (const path of [`/notes/${parent.id}`, `/notes/${child.id}`, `/spaces/${owner.personalSpaceId}/notes`, `/spaces/${owner.personalSpaceId}/page-children`, `/spaces/${owner.personalSpaceId}/members`, `/items/${task.id}`, `/notes/${note.id}/people`]) expect((await recipient.call('GET', path)).status).toBe(path.endsWith('/people') ? 403 : 404);
    expect((await recipient.call('GET', `/items/${note.id}/links`)).body.backlinks).toEqual([]);
    expect((await recipient.call('GET', '/search?q=sharedquartz')).body.items).toEqual([expect.objectContaining({ id: note.id, spaceName: 'Shared page' })]);
    expect((await recipient.call('GET', '/me/notes')).body).toEqual([expect.objectContaining({ id: note.id, parentId: null })]);
    expect((await recipient.call('POST', `/notes/${note.id}/comments`, { body: 'Denied' })).status).toBe(403);
    expect((await recipient.call('PATCH', `/notes/${note.id}`, { title: 'Denied' })).status).toBe(403);
    expect((await recipient.call('GET', `/notes/${note.id}/versions`)).status).toBe(403);
    expect((await owner.call('PUT', `/notes/${note.id}/people`, { email: recipient.email, role: 'comment' })).status).toBe(200);
    expect((await recipient.call('POST', `/notes/${note.id}/comments`, { body: 'Allowed comment' })).status).toBe(201);
    expect((await recipient.call('PATCH', `/notes/${note.id}`, { title: 'Denied' })).status).toBe(403);
    expect((await owner.call('PUT', `/notes/${note.id}/people`, { email: recipient.email, role: 'edit' })).status).toBe(200);
    expect((await recipient.call('PATCH', `/notes/${note.id}`, { title: 'Sharedquartz updated' })).status).toBe(200);
    expect((await recipient.call('PATCH', `/notes/${note.id}`, { parentId: null })).status).toBe(403);
    expect((await recipient.call('PUT', `/notes/${note.id}/database`, { properties: [], view: 'table' })).status).toBe(403);
    expect((await recipient.call('POST', `/items/${note.id}/share-links`, { access: 'view' })).status).toBe(403);
    expect((await recipient.call('POST', `/items/${note.id}/trash`)).status).toBe(404);
    expect((await recipient.call('GET', `/notes/${note.id}/versions`)).status).toBe(200);
    expect((await owner.call('PUT', `/notes/${task.id}/people`, { email: recipient.email, role: 'manage' })).status).toBe(404);
    expect((await owner.call('DELETE', `/notes/${note.id}/people/${recipient.id}`)).status).toBe(204);
    expect((await recipient.call('GET', `/notes/${note.id}`)).status).toBe(404);
    expect((await recipient.call('GET', '/search?q=sharedquartz')).body.items).toEqual([]);
  });

  it('closes changed grant sessions, supports page managers and filters database rows by their own access', async () => {
    const owner = await member('grant-live-owner');
    const recipient = await member('grant-live-recipient');
    const other = await member('grant-live-other');
    const note = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Live shared page' })).body;
    const child = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Private row', parentId: note.id })).body;
    await owner.call('PUT', `/notes/${note.id}/database`, { properties: [], view: 'table' });
    await owner.call('PUT', `/notes/${note.id}/people`, { email: recipient.email, role: 'edit' });
    expect((await recipient.call('GET', `/notes/${note.id}/database`)).body.rows).toEqual([]);
    const editor = await open(recipient, note.id);
    write(editor.document, 'Written by a direct recipient');
    const realtime = strata.service(RealtimeService);
    expect(await until(async () => textOf(realtime.hocuspocus.documents.get(note.id)!), (text) => text.includes('direct recipient'))).toContain('direct recipient');
    const closed: string[] = [];
    editor.provider.on('close', ({ event }: { event: { reason: string } }) => closed.push(event.reason));
    await owner.call('PUT', `/notes/${note.id}/people`, { email: recipient.email, role: 'view' });
    expect(await until(async () => closed, (reasons) => reasons.includes('Access changed'))).toContain('Access changed');
    editor.provider.destroy();
    const viewer = await open(recipient, note.id);
    write(viewer.document, 'Must not persist');
    await settle();
    expect(textOf(realtime.hocuspocus.documents.get(note.id)!)).not.toContain('Must not persist');
    viewer.provider.destroy();
    await owner.call('PUT', `/notes/${note.id}/people`, { email: recipient.email, role: 'manage' });
    expect((await recipient.call('POST', `/items/${note.id}/share-links`, { access: 'edit' })).status).toBe(201);
    expect((await recipient.call('PUT', `/notes/${note.id}/people`, { email: other.email, role: 'comment' })).status).toBe(200);
    expect((await recipient.call('PUT', `/notes/${note.id}/people`, { email: recipient.email, role: 'edit' })).status).toBe(400);
    await owner.call('PUT', `/notes/${child.id}/people`, { email: recipient.email, role: 'view' });
    expect((await recipient.call('GET', `/notes/${note.id}/database`)).body.rows.map((row: { id: string }) => row.id)).toEqual([child.id]);
    expect((await recipient.call('GET', `/notes/${child.id}`)).body.parentId).toBe(note.id);
    expect((await recipient.call('POST', `/spaces/${owner.personalSpaceId}/notes`, { title: 'Denied' })).status).toBe(404);
  });

  it('creates an imported page from its document, indexes it and links its images', async () => {
    const owner = await member('importer');
    const stranger = await member('outsider');
    const space = owner.personalSpaceId;
    const picture = await strata.item(space, 'map.png', ItemKind.FILE);
    const hidden = await strata.item(stranger.personalSpaceId, 'secret.png', ItemKind.FILE);
    const document = new Y.Doc();
    const heading = new Y.XmlElement('heading');
    heading.setAttribute('level', 2 as never);
    heading.insert(0, [new Y.XmlText('Packing')]);
    const image = new Y.XmlElement('image');
    image.setAttribute('fileId', picture.id);
    const other = new Y.XmlElement('image');
    other.setAttribute('fileId', hidden.id);
    document.getXmlFragment('default').push([heading, image, other]);
    const state = Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64');

    const imported = await owner.call('POST', `/spaces/${space}/notes`, { title: 'Trip', state });
    expect(imported.status).toBe(201);
    const stored = await strata.prisma.noteDocument.findUniqueOrThrow({ where: { itemId: imported.body.id } });
    const copy = new Y.Doc();
    Y.applyUpdate(copy, new Uint8Array(stored.state));
    expect(textOf(copy)).toContain('<heading level="2">Packing</heading>');
    expect((await owner.call('GET', '/search?q=packing')).body.items).toEqual([expect.objectContaining({ id: imported.body.id })]);
    expect(await strata.prisma.itemLink.findMany({ where: { sourceItemId: imported.body.id }, select: { kind: true, targetItemId: true } })).toEqual([
      { kind: 'ATTACHMENT', targetItemId: picture.id },
    ]);

    expect((await owner.call('POST', `/spaces/${space}/notes`, { state: 'not base64!' })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space}/notes`, { state: Buffer.from('nonsense').toString('base64') })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${space}/notes`, { board: true, state })).status).toBe(400);
  });
});
