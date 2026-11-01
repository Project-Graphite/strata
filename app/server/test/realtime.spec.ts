import { ConfigService } from '@nestjs/config';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { ItemKind, ShareAccess, SpaceRole } from '@prisma/client';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { linkTokenHash } from '../src/crypto/link-token';
import { editorFormat, guestTokenPrefix, RealtimeService } from '../src/realtime/realtime.service';

class TrustedSocket extends WebSocket {
  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols, { origin: 'http://localhost:4104' });
  }
}

function write(document: Y.Doc, text: string) {
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  document.getXmlFragment('default').push([paragraph]);
}

interface Peer {
  document: Y.Doc;
  provider: HocuspocusProvider;
  messages: { type: string; title?: string; updatedAt?: string; snapshot?: string; people?: { id: string; name: string; access: string; guest: boolean; activity: string }[] }[];
  closed: string[];
  socket: HocuspocusProviderWebsocket;
}

describe('live shared documents', () => {
  let server: Server;
  let realtime: RealtimeService;
  let base: string;
  let stored: Map<string, Buffer>;
  let thumbnails: Map<string, string | undefined>;
  let accessQueries: number;
  let links: Map<string, { id: string; itemId: string; access: ShareAccess; expiresAt: Date; revokedAt: Date | null }>;
  let commit: (operations: Promise<unknown>[]) => Promise<unknown[]>;
  let lastEditor: string | null | undefined;
  const peers: Peer[] = [];

  beforeEach(async () => {
    stored = new Map();
    thumbnails = new Map();
    accessQueries = 0;
    lastEditor = undefined;
    const signedInAt = new Date();
    links = new Map(['page', 'board'].flatMap((itemId) => [ShareAccess.VIEW, ShareAccess.EDIT].map((access) => [
      linkTokenHash(`${itemId}-${access}`),
      { id: `${itemId}-${access}`, itemId, access, expiresAt: new Date(Date.now() + 60_000), revokedAt: null },
    ])));
    commit = (operations) => Promise.all(operations);
    server = createServer();
    realtime = new RealtimeService(
      { httpAdapter: { getHttpServer: () => server } } as never,
      {
        shareLink: {
          findFirst: async ({ where }: { where: { tokenHash: string; itemId: string } }) => {
            const link = links.get(where.tokenHash);
            return link && link.itemId === where.itemId && !link.revokedAt && link.expiresAt > new Date() ? link : null;
          },
          findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
            accessQueries += 1;
            return [...links.values()].filter((link) => where.id.in.includes(link.id) && !link.revokedAt && link.expiresAt > new Date()).map(({ id }) => ({ id }));
          },
        },
        noteDocument: {
          findUnique: async ({ where }: { where: { itemId: string } }) => stored.has(where.itemId) ? { state: stored.get(where.itemId) } : null,
          upsert: async ({ where, update }: { where: { itemId: string }; update: { state: Buffer; thumbnail?: string } }) => {
            thumbnails.set(where.itemId, update.thumbnail);
            return { itemId: where.itemId, state: update.state };
          },
        },
        searchDocument: { updateMany: async () => ({ count: 1 }) },
        item: {
          findUnique: async () => ({ title: 'Shared page', updatedAt: new Date() }),
          findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({ kind: where.id === 'board' ? ItemKind.BOARD : ItemKind.NOTE }),
          update: async ({ data }: { data: { updatedById: string | null } }) => {
            lastEditor = data.updatedById;
            return { spaceId: 'space' };
          },
        },
        refreshSession: {
          findUniqueOrThrow: async () => ({ signedInAt, user: { displayName: 'Member' } }),
          findMany: async ({ where }: { where: { userId: { in: string[] } } }) => {
            accessQueries += 1;
            return where.userId.in.map((userId) => ({ userId, signedInAt }));
          },
        },
        itemLink: { findMany: async () => [] },
        noteVersion: { findFirst: async () => null, create: async () => ({}) },
        $transaction: async (operations: Promise<unknown>[]) => {
          const result = await commit(operations);
          const document = result[0] as { itemId: string; state: Buffer };
          stored.set(document.itemId, document.state);
          return result;
        },
      } as never,
      { assertItem: async () => ({ role: SpaceRole.OWNER, trashedAt: null }) } as never,
      { verifyAsync: async (token: string) => ({ sub: token, sid: 'session' }) } as never,
      { validate: async ({ sub }: { sub: string }) => ({ id: sub }) } as never,
      { notify: () => undefined } as never,
      new ConfigService({ AUTH_TRUSTED_ORIGINS: 'http://localhost:4104', AUTH_ACCESS_TOKEN_SECRET: 'test-realtime-secret' }),
      {
        assertPage: async () => ({ role: SpaceRole.OWNER, trashedAt: null, permissions: { organize: true } }),
        openPageAccess: async () => {
          accessQueries += 1;
          return () => ({ role: SpaceRole.OWNER, permissions: { organize: true } });
        },
      } as never,
    );
    realtime.onApplicationBootstrap();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/realtime?format=${editorFormat}`;
  });

  afterEach(async () => {
    for (const peer of peers.splice(0)) {
      peer.provider.destroy();
      peer.socket.destroy();
      peer.document.destroy();
    }
    await realtime.onModuleDestroy();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.size).toBe(0));
  });

  function open(token: string, name = 'page', document = new Y.Doc()) {
    const messages: Peer['messages'] = [];
    const closed: string[] = [];
    const socket = new HocuspocusProviderWebsocket({ url: base, WebSocketPolyfill: TrustedSocket });
    return new Promise<Peer>((resolve, reject) => {
      const provider = new HocuspocusProvider({
        name,
        token,
        document,
        websocketProvider: socket,
        onSynced: () => resolve(peer),
        onAuthenticationFailed: ({ reason }) => {
          socket.disconnect();
          reject(new Error(reason));
        },
        onStateless: ({ payload }) => messages.push(JSON.parse(payload)),
        onClose: ({ event }) => {
          closed.push(event.reason);
          socket.disconnect();
        },
      });
      const peer = { document, provider, messages, closed, socket };
      peers.push(peer);
      provider.attach();
    });
  }

  const guest = (code: string) => `${guestTokenPrefix}${code}`;
  const text = (peer: Peer) => peer.document.getXmlFragment('default').toString();

  it('delivers initial and updated titles to live guests without accepting guest-forged titles', async () => {
    const host = await open('member');
    const viewer = await open(guest('page-VIEW'));
    await vi.waitFor(() => expect(viewer.messages.some((message) => message.type === 'title' && message.title === 'Shared page')).toBe(true));
    realtime.titleChanged('page', 'Renamed page', new Date());
    await vi.waitFor(() => expect(viewer.messages.some((message) => message.type === 'title' && message.title === 'Renamed page')).toBe(true));
    viewer.provider.sendStateless(JSON.stringify({ type: 'title', title: 'Forged title' }));
    viewer.provider.sendStateless('status');
    await vi.waitFor(() => expect(viewer.messages.filter((message) => message.type === 'title').length).toBeGreaterThan(2));
    expect(host.messages.some((message) => message.title === 'Forged title')).toBe(false);
  });

  it('streams page edits to viewers, accepts edit-link changes and rejects view-link writes', async () => {
    const host = await open('member');
    const viewer = await open(guest('page-VIEW'));
    const editor = await open(guest('page-EDIT'));
    write(host.document, 'Host text');
    await vi.waitFor(() => expect(text(viewer)).toContain('Host text'));
    write(editor.document, 'Guest text');
    await vi.waitFor(() => expect(text(host)).toContain('Guest text'));
    write(viewer.document, 'Forbidden text');
    viewer.provider.sendStateless('status');
    await vi.waitFor(() => expect(viewer.messages.filter((message) => message.type === 'presence').length).toBeGreaterThan(1));
    expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').toString()).not.toContain('Forbidden text');
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(stored.has('page')).toBe(true));
    expect(lastEditor).toBeNull();
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, stored.get('page')!);
      expect(saved.getXmlFragment('default').toString()).toContain('Guest text');
      expect(saved.getXmlFragment('default').toString()).not.toContain('Forbidden text');
    } finally {
      saved.destroy();
    }
  });

  it('scopes links to one document and closes revoked and expired guest sessions', async () => {
    await expect(open(guest('page-EDIT'), 'other-page')).rejects.toThrow();
    await expect(open(guest('missing'))).rejects.toThrow();
    const host = await open('member');
    const viewer = await open(guest('page-VIEW'));
    const editor = await open(guest('page-EDIT'));
    links.get(linkTokenHash('page-EDIT'))!.revokedAt = new Date();
    realtime.closeShareLink('page-EDIT');
    await vi.waitFor(() => expect(editor.closed).toContain('Access changed'));
    await expect(open(guest('page-EDIT'))).rejects.toThrow();
    links.get(linkTokenHash('page-VIEW'))!.expiresAt = new Date(0);
    await realtime.recheckAccess();
    await vi.waitFor(() => expect(viewer.closed).toContain('Access changed'));
    await expect(open(guest('page-VIEW'))).rejects.toThrow();
    write(host.document, 'Still private');
    expect(host.closed).toEqual([]);
  });

  it('counts member identities once, includes passive guests and removes disconnected viewers', async () => {
    const host = await open('member');
    await open('member');
    const viewer = await open(guest('page-VIEW'));
    await open(guest('page-VIEW'));
    host.provider.sendStateless('status');
    await vi.waitFor(() => {
      expect(host.messages.filter((message) => message.type === 'presence').at(-1)?.people).toEqual([
        { id: 'member/member', name: 'Member', access: 'edit', guest: false, activity: 'reading' },
        { id: expect.stringMatching(/^guest\//), name: 'Guest', access: 'view', guest: true, activity: 'reading' },
        { id: expect.stringMatching(/^guest\//), name: 'Guest', access: 'view', guest: true, activity: 'reading' },
      ]);
    });
    viewer.provider.setAwarenessField('user', { id: 'member/member', name: 'Pretend owner', color: 'invalid' });
    await vi.waitFor(() => expect([...host.provider.awareness!.getStates().values()].some((state) => state.user?.name === 'Guest')).toBe(true));
    expect([...host.provider.awareness!.getStates().values()].some((state) => state.user?.name === 'Pretend owner')).toBe(false);
    viewer.provider.setAwarenessField('viewport', { blockId: 'shared-block' });
    await vi.waitFor(() => {
      expect(host.provider.awareness!.getStates().get(viewer.provider.awareness!.clientID)).toMatchObject({
        user: { id: expect.stringMatching(/^guest\//), name: 'Guest', color: '#6a9eea' },
        viewport: { blockId: 'shared-block' },
      });
    });
    viewer.socket.disconnect();
    viewer.socket.destroy();
    await vi.waitFor(() => expect(host.messages.filter((message) => message.type === 'presence').at(-1)?.people).toHaveLength(2));
  });

  it('sends a burst of collaborator pointer moves to each connection as a few batched frames', async () => {
    const host = await open('member', 'board');
    const collaborators = await Promise.all([1, 2, 3].map(() => open(guest('board-EDIT'), 'board')));
    let frames = 0;
    host.socket.on('message', () => (frames += 1));
    for (let move = 1; move <= 20; move += 1) {
      for (const collaborator of collaborators) collaborator.provider.setAwarenessField('pointer', { x: move, y: move });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await vi.waitFor(() => {
      for (const collaborator of collaborators) expect(host.provider.awareness!.getStates().get(collaborator.provider.awareness!.clientID)?.pointer).toEqual({ x: 20, y: 20 });
    });
    expect(frames).toBeLessThan(8);
  });

  it('reports editing from accepted writes and keeps a member active while another tab is reading', async () => {
    const host = await open('member');
    const otherTab = await open('member');
    const viewer = await open(guest('page-VIEW'));
    const editor = await open(guest('page-EDIT'));
    const people = () => host.messages.filter((message) => message.type === 'presence').at(-1)?.people;
    host.provider.sendStateless('idle');
    viewer.provider.sendStateless('idle');
    await vi.waitFor(() => {
      expect(people()?.find((person) => person.id === 'member/member')?.activity).toBe('reading');
      expect(people()?.find((person) => person.access === 'view')?.activity).toBe('idle');
    });
    otherTab.provider.sendStateless('idle');
    await vi.waitFor(() => expect(people()?.find((person) => person.id === 'member/member')?.activity).toBe('idle'));
    write(editor.document, 'Guest is editing');
    await vi.waitFor(() => expect(people()?.find((person) => person.guest && person.access === 'edit')?.activity).toBe('editing'));
    viewer.provider.sendStateless('editing');
    viewer.provider.sendStateless('active');
    await vi.waitFor(() => expect(people()?.find((person) => person.access === 'view')?.activity).toBe('reading'));
    write(viewer.document, 'Viewers cannot claim an edit');
    viewer.provider.sendStateless('status');
    await vi.waitFor(() => expect(viewer.messages.filter((message) => message.type === 'presence').at(-1)?.people?.find((person) => person.access === 'view')?.activity).toBe('reading'));
    expect(text(host)).not.toContain('Viewers cannot claim an edit');
  });

  it('acknowledges the persisted snapshot only after commit, including deletions', async () => {
    const editor = await open(guest('page-EDIT'));
    let finish!: () => void;
    commit = async (operations) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return Promise.all(operations);
    };
    write(editor.document, 'Pending');
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').length).toBe(1));
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(editor.messages.filter((message) => message.type === 'saved').some((message) => Y.equalSnapshots(Y.decodeSnapshot(Buffer.from(message.snapshot!, 'base64')), Y.snapshot(editor.document)))).toBe(false);
    finish();
    await vi.waitFor(() => expect(Y.equalSnapshots(Y.decodeSnapshot(Buffer.from(editor.messages.filter((message) => message.type === 'saved').at(-1)!.snapshot!, 'base64')), Y.snapshot(editor.document))).toBe(true));
    commit = (operations) => Promise.all(operations);
    editor.document.getXmlFragment('default').delete(0, 1);
    expect(Y.equalSnapshots(Y.decodeSnapshot(Buffer.from(editor.messages.filter((message) => message.type === 'saved').at(-1)!.snapshot!, 'base64')), Y.snapshot(editor.document))).toBe(false);
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').length).toBe(0));
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(Y.equalSnapshots(Y.decodeSnapshot(Buffer.from(editor.messages.filter((message) => message.type === 'saved').at(-1)!.snapshot!, 'base64')), Y.snapshot(editor.document))).toBe(true));
  });

  it('reports a failed save without acknowledging the rejected revision', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const editor = await open(guest('page-EDIT'));
    commit = async () => { throw new Error('Database unavailable'); };
    write(editor.document, 'Not committed');
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').length).toBe(1));
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(editor.messages).toContainEqual({ type: 'save-failed' }));
    expect(stored.has('page')).toBe(false);
    expect(editor.messages.filter((message) => message.type === 'saved').some((message) => Y.equalSnapshots(Y.decodeSnapshot(Buffer.from(message.snapshot!, 'base64')), Y.snapshot(editor.document)))).toBe(false);
    commit = (operations) => Promise.all(operations);
    write(editor.document, 'Retry');
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').length).toBe(2));
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(stored.has('page')).toBe(true));
  });

  it('retries failed saves without another edit and refuses retry requests from view links', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const editor = await open(guest('page-EDIT'));
    const viewer = await open(guest('page-VIEW'));
    commit = async () => { throw new Error('Database unavailable'); };
    write(editor.document, 'Recover this draft');
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').length).toBe(1));
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(editor.messages).toContainEqual({ type: 'save-failed' }));
    commit = (operations) => Promise.all(operations);
    const replies = viewer.messages.filter((message) => message.type === 'presence').length;
    viewer.provider.sendStateless('retry-save');
    viewer.provider.sendStateless('status');
    await vi.waitFor(() => expect(viewer.messages.filter((message) => message.type === 'presence').length).toBeGreaterThan(replies));
    expect(stored.has('page')).toBe(false);
    editor.provider.sendStateless('retry-save');
    await vi.waitFor(() => expect(stored.has('page')).toBe(true));
    expect(lastEditor).toBeNull();
  });

  it('waits for buffered page writes before completing shutdown', async () => {
    const editor = await open(guest('page-EDIT'));
    let finish!: () => void;
    commit = async (operations) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return Promise.all(operations);
    };
    write(editor.document, 'Before restart');
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').length).toBe(1));
    let finished = false;
    const shutdown = realtime.onModuleDestroy().then(() => { finished = true; });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(finished).toBe(false);
    expect(stored.has('page')).toBe(false);
    finish();
    await shutdown;
    expect(finished).toBe(true);
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, stored.get('page')!);
      expect(saved.getXmlFragment('default').toString()).toContain('Before restart');
    } finally {
      saved.destroy();
    }
  });

  it.each([['image', 'fileId'], ['mention', 'id'], ['boardEmbed', 'boardId'], ['childPage', 'pageId'], ['pageLink', 'pageId']])('rejects private %s references from guests before a member can accidentally share them', async (kind, attribute) => {
    const host = await open('member');
    const editor = await open(guest('page-EDIT'));
    const reference = new Y.XmlElement(kind);
    reference.setAttribute(attribute, 'private-file');
    editor.document.getXmlFragment('default').push([reference]);
    await vi.waitFor(() => expect(editor.closed).toContain('Edit rejected'));
    expect(text(host)).not.toContain('private-file');
    expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').toString()).not.toContain('private-file');
  });

  it('lets guests edit content around an existing shared image', async () => {
    const initial = new Y.Doc();
    const image = new Y.XmlElement('image');
    image.setAttribute('fileId', 'shared-file');
    initial.getXmlFragment('default').push([image]);
    stored.set('page', Buffer.from(Y.encodeStateAsUpdate(initial)));
    initial.destroy();
    const host = await open('member');
    const editor = await open(guest('page-EDIT'));
    (editor.document.getXmlFragment('default').get(0) as Y.XmlElement).setAttribute('alt', 'Guest caption');
    write(editor.document, 'More context');
    await vi.waitFor(() => expect(text(host)).toContain('Guest caption'));
    await vi.waitFor(() => expect(text(host)).toContain('More context'));
    expect(editor.closed).toEqual([]);
  });

  it('lets guests copy an existing shared image but not point it at a private file', async () => {
    const initial = new Y.Doc();
    const image = new Y.XmlElement('image');
    image.setAttribute('fileId', 'shared-file');
    initial.getXmlFragment('default').push([image]);
    stored.set('page', Buffer.from(Y.encodeStateAsUpdate(initial)));
    initial.destroy();
    const host = await open('member');
    const editor = await open(guest('page-EDIT'));
    const copy = new Y.XmlElement('image');
    copy.setAttribute('fileId', 'shared-file');
    editor.document.getXmlFragment('default').push([copy]);
    await vi.waitFor(() => expect(host.document.getXmlFragment('default').length).toBe(2));
    (editor.document.getXmlFragment('default').get(0) as Y.XmlElement).setAttribute('fileId', 'private-file');
    await vi.waitFor(() => expect(editor.closed).toContain('Edit rejected'));
    expect(text(host)).not.toContain('private-file');
  });

  it('rejects private images placed on a board by guests', async () => {
    const host = await open('member', 'board');
    const editor = await open(guest('board-EDIT'), 'board');
    editor.document.getMap('board').set('photo', { type: 'image', fileId: 'private-file', version: 1 });
    await vi.waitFor(() => expect(editor.closed).toContain('Edit rejected'));
    expect(host.document.getMap('board').has('photo')).toBe(false);
  });

  it('keeps live board editing working through existing links', async () => {
    const host = await open('member', 'board');
    const editor = await open(guest('board-EDIT'), 'board');
    editor.document.getMap('board').set('box', { type: 'rectangle', version: 1 });
    await vi.waitFor(() => expect(host.document.getMap('board').get('box')).toEqual({ type: 'rectangle', version: 1 }));
  });

  it('stores a thumbnail with each board save and leaves pages without one', async () => {
    const board = await open('member', 'board');
    board.document.getMap('board').set('box', { id: 'box', type: 'rectangle', x: 0, y: 0, width: 40, height: 20, version: 1 });
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('board')!.getMap('board').has('box')).toBe(true));
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(thumbnails.get('board')).toContain('<rect x="0" y="0" width="40" height="20"'));
    const page = await open('member');
    write(page.document, 'No drawing here');
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('page')!.getXmlFragment('default').length).toBe(1));
    realtime.hocuspocus.flushPendingStores();
    await vi.waitFor(() => expect(thumbnails.has('page')).toBe(true));
    expect(thumbnails.get('page')).toBeUndefined();
  });

  it('accepts a near-limit board sent whole after reconnecting instead of refusing the frame', async () => {
    const offline = new Y.Doc();
    const elements = offline.getMap('board');
    offline.transact(() => {
      for (let index = 0; index < 1_400; index += 1) elements.set(`stroke-${index}`, { id: `stroke-${index}`, type: 'freedraw', version: 1, points: Array.from({ length: 200 }, (_, point) => [point + 0.5, point + 0.25]) });
    });
    expect(Y.encodeStateAsUpdate(offline).byteLength).toBeGreaterThan(3 * 1024 * 1024);
    const editor = await open('member', 'board', offline);
    await vi.waitFor(() => expect(realtime.hocuspocus.documents.get('board')!.getMap('board').size).toBe(1_400), { timeout: 5_000 });
    expect(editor.closed).toEqual([]);
  });

  it('rechecks every open connection with one query per kind of access', async () => {
    const host = await open('member');
    await open('member');
    await open('colleague', 'board');
    const viewer = await open(guest('page-VIEW'));
    accessQueries = 0;
    await realtime.recheckAccess();
    expect(accessQueries).toBe(3);
    expect(host.closed).toEqual([]);
    expect(viewer.closed).toEqual([]);
  });
});
