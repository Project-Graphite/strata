import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { SpaceRole } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { RealtimeService } from '../../src/realtime/realtime.service';
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

  function open(as: Member, name: string) {
    const document = new Y.Doc();
    const websocketProvider = new HocuspocusProviderWebsocket({
      url: `${strata.base.replace(/^http/, 'ws')}/api/v1/realtime`,
      WebSocketPolyfill: TrustedSocket,
    });
    return new Promise<{ provider: HocuspocusProvider; document: Y.Doc }>((resolve, reject) => {
      const provider: HocuspocusProvider = new HocuspocusProvider({
        name,
        token: as.token,
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
  });

  it('refuses other origins and disconnects someone who lost access', async () => {
    const owner = await member('host');
    const guest = await member('guest');
    const space = (await owner.call('POST', '/spaces', { name: 'Shared' })).body;
    await strata.join(space.id, guest, SpaceRole.EDITOR);
    const note = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Ideas' })).body;

    const refused = await new Promise<number>((resolve) => {
      const socket = new WebSocket(`${strata.base.replace(/^http/, 'ws')}/api/v1/realtime`, { origin: 'https://evil.example' });
      socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
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
});
