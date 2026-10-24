import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { LinkKind, ShareAccess, SpaceRole } from '@prisma/client';
import { Hocuspocus, type Connection, type Document } from '@hocuspocus/server';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { messageYjsSyncStep1 } from 'y-protocols/sync';
import * as Y from 'yjs';
import { AccessService } from '../access/access.service';
import { refreshReuseGraceMs } from '../auth/auth.service';
import { JwtStrategy, type AccessTokenPayload } from '../auth/jwt.strategy';
import { ChangesService } from '../changes/changes.service';
import { linkTokenHash } from '../crypto/link-token';
import { boardElementsKey, documentLinks, documentText, pageKinds } from '../notes/document-text';
import { maxDocumentBytes } from '../notes/document-limits';
import { editorFormat } from '../notes/editor-format';
import { PageAccessService } from '../notes/page-access.service';
export { editorFormat } from '../notes/editor-format';
import { PrismaService } from '../prisma/prisma.service';

export const realtimePath = '/api/v1/realtime';
const maxUpdateBytes = 2 * 1024 * 1024;
const maxDocumentsPerUser = 40;
const maxGuestsPerLink = 100;
const recheckMs = 60_000;
const versionEveryMs = 15 * 60 * 1000;
const maxLinksPerNote = 200;

interface BoardVersion {
  version?: number;
  isDeleted?: boolean;
}

export const guestTokenPrefix = 'share:';

export type RealtimeContext = { userId: string; role: SpaceRole; signedInAt?: Date; name?: string; restrictedReferences?: boolean } | { userId: null; shareLinkId: string };

function openerOf(context: RealtimeContext) {
  return context.userId === null ? `link/${context.shareLinkId}` : context.userId;
}

function rejectUpgrade(socket: Duplex, status: number, reason: string) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: maxUpdateBytes });
  private readonly openDocuments = new Map<string, Set<string>>();
  private readonly savedSnapshots = new Map<string, Y.Snapshot>();
  private readonly lastEditors = new Map<string, RealtimeContext>();
  private readonly activity = new Map<Connection<RealtimeContext>, { activeAt: number; editedAt: number; idle: boolean }>();
  private readonly presencePayloads = new Map<string, string>();
  private closing = false;
  private pendingShutdown?: Promise<void>;
  private readonly trustedOrigins: string[];
  private readonly accessTokenSecret: string;
  private recheck?: NodeJS.Timeout;
  private presenceTimer?: NodeJS.Timeout;
  readonly hocuspocus: Hocuspocus<RealtimeContext>;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly jwt: JwtService,
    private readonly sessions: JwtStrategy,
    private readonly changes: ChangesService,
    config: ConfigService,
    private readonly pages: PageAccessService,
  ) {
    this.trustedOrigins = config.get<string>('AUTH_TRUSTED_ORIGINS')?.split(',') ?? [];
    this.accessTokenSecret = config.getOrThrow<string>('AUTH_ACCESS_TOKEN_SECRET');
    this.hocuspocus = new Hocuspocus<RealtimeContext>({
      quiet: true,
      debounce: 2_000,
      maxDebounce: 10_000,
      onAuthenticate: async ({ connectionConfig, documentName, requestParameters, socketId, token }) => {
        if (Number(requestParameters.get('format')) < editorFormat) throw Object.assign(new Error('outdated'), { reason: 'outdated' });
        const { context, readOnly } = token.startsWith(guestTokenPrefix)
          ? await this.guest(token.slice(guestTokenPrefix.length), documentName)
          : await this.member(token, documentName);
        const opener = openerOf(context);
        const open = this.openDocuments.get(opener) ?? new Set<string>();
        const key = `${socketId}/${documentName}`;
        if (!open.has(key) && open.size >= (context.userId ? maxDocumentsPerUser : maxGuestsPerLink)) throw new Error('Too many open documents');
        open.add(key);
        this.openDocuments.set(opener, open);
        connectionConfig.readOnly = readOnly;
        return context;
      },
      onLoadDocument: async ({ document, documentName }) => {
        const stored = await this.prisma.noteDocument.findUnique({ where: { itemId: documentName }, select: { state: true } });
        if (stored) Y.applyUpdate(document, new Uint8Array(stored.state));
        this.savedSnapshots.set(documentName, Y.snapshot(document));
        return document;
      },
      connected: async ({ connection }) => {
        this.activity.set(connection, { activeAt: Date.now(), editedAt: 0, idle: false });
        this.sendPresence(connection.document);
        this.sendSaved(connection.document);
        await this.sendTitle(connection);
      },
      onStateless: async ({ connection, payload }) => {
        if (payload === 'active' || payload === 'idle') {
          const activity = this.activity.get(connection);
          if (activity) {
            activity.activeAt = Date.now();
            activity.idle = payload === 'idle';
            this.sendPresence(connection.document, true);
          }
          return;
        }
        if (payload === 'retry-save' && !connection.readOnly) {
          await this.saveNow(connection.document);
          return;
        }
        if (payload !== 'status') return;
        this.sendPresence(connection.document);
        this.sendSaved(connection.document);
        await this.sendTitle(connection);
      },
      beforeSync: async ({ connection, context, document, payload, type }) => {
        if (connection.readOnly || type === messageYjsSyncStep1 || (context.userId !== null && !context.restrictedReferences)) return;
        const candidate = new Y.Doc();
        try {
          Y.applyUpdate(candidate, Y.encodeStateAsUpdate(document));
          Y.applyUpdate(candidate, payload);
          const current = documentLinks(document);
          const next = documentLinks(candidate);
          for (const id of [...next.files].filter((id) => !current.files.has(id))) {
            if (context.userId === null || !(await this.prisma.item.findFirst({ where: { id, kind: 'FILE', trashedAt: null, space: this.access.spacesOf(context.userId) }, select: { id: true } }))) throw Object.assign(new Error('Edits cannot add inaccessible files'), { code: 4403, reason: 'Edit rejected' });
          }
          for (const id of [...next.mentions].filter((id) => !current.mentions.has(id))) {
            if (context.userId === null || !(await this.prisma.item.findFirst({ where: { id, OR: [this.access.itemsOf(context.userId), this.pages.pagesOf(context.userId)] }, select: { id: true } }))) throw Object.assign(new Error('Edits cannot add inaccessible references'), { code: 4403, reason: 'Edit rejected' });
          }
        } finally {
          candidate.destroy();
        }
      },
      beforeHandleAwareness: async ({ connection, context, document, states }) => {
        if (!connection || !context) return;
        for (const [clientId, state] of states) {
          if (Object.keys(state).length === 0 || [...document.connections].some(([other, entry]) => other !== connection && entry.clients.has(clientId))) states.delete(clientId);
        }
        if (states.size > 1) throw new Error('Send only your own presence');
        for (const state of states.values()) {
          if (JSON.stringify(state).length > 4096) throw new Error('Presence is too large');
          state.user = { id: context.userId === null ? `guest/${connection.socketId}` : `member/${context.userId}`, name: context.userId === null ? 'Guest' : context.name, color: /^#[0-9a-f]{6}$/i.test(state.user?.color) ? state.user.color : '#6a9eea' };
        }
      },
      afterUnloadDocument: async ({ documentName }) => {
        if (!this.closing) {
          this.savedSnapshots.delete(documentName);
          this.lastEditors.delete(documentName);
          this.presencePayloads.delete(documentName);
        }
      },
      onChange: async ({ document, documentName, context, connection }) => {
        if (context) this.lastEditors.set(documentName, context);
        const activity = connection && this.activity.get(connection);
        if (activity && !connection.readOnly) {
          activity.activeAt = Date.now();
          activity.editedAt = Date.now();
          activity.idle = false;
          this.sendPresence(document, true);
        }
      },
      onStoreDocument: async ({ clientsCount, document, documentName, lastContext }) => {
        const state = Y.encodeStateAsUpdate(document);
        const snapshot = Y.snapshot(document);
        if (state.byteLength > maxDocumentBytes) {
          this.logger.warn(`Note ${documentName} is over the size limit and was not saved`);
          document.broadcastStateless(JSON.stringify({ type: 'too-large' }));
          for (const connection of document.getConnections()) connection.close({ code: 4413, reason: 'This page is too large' });
          return;
        }
        const [, , item] = await this.prisma.$transaction([
          this.prisma.noteDocument.upsert({
            where: { itemId: documentName },
            create: { itemId: documentName, state: Buffer.from(state) },
            update: { state: Buffer.from(state) },
          }),
          this.prisma.searchDocument.updateMany({ where: { itemId: documentName }, data: { bodyText: documentText(document), updatedAt: new Date() } }),
          this.prisma.item.update({
            where: { id: documentName },
            data: { updatedById: lastContext?.userId ?? null, updatedAt: new Date() },
          }),
        ]).catch((error: unknown) => {
          document.broadcastStateless(JSON.stringify({ type: 'save-failed' }));
          throw error;
        });
        this.savedSnapshots.set(documentName, snapshot);
        this.sendSaved(document);
        this.changes.notify('pages', { spaceId: item.spaceId });
        if (lastContext?.userId) await this.syncLinks(documentName, document, lastContext.userId);
        await this.snapshot(documentName, state, lastContext?.userId ?? null, clientsCount === 0);
      },
      onDisconnect: async ({ clientsCount, context, document, documentName, socketId }) => {
        if (!context) return;
        for (const connection of this.activity.keys()) if (connection.socketId === socketId && connection.document === document) this.activity.delete(connection);
        this.sendPresence(document);
        const opener = openerOf(context);
        const open = this.openDocuments.get(opener);
        open?.delete(`${socketId}/${documentName}`);
        if (open?.size === 0) this.openDocuments.delete(opener);
        if (clientsCount === 0) {
          await this.snapshot(documentName, Y.encodeStateAsUpdate(document), this.lastEditors.get(documentName)?.userId ?? null, true).catch((error: unknown) => {
            this.logger.error(`Could not save the final history snapshot for page ${documentName}`, error);
          });
        }
      },
    });
  }

  private sendPresence(document: Document, changedOnly = false) {
    const people = new Map<string, { id: string; name: string; access: 'view' | 'edit'; guest: boolean; activity: 'reading' | 'editing' | 'idle' }>();
    for (const connection of document.getConnections()) {
      const context = connection.context as RealtimeContext;
      const id = context.userId === null ? `guest/${connection.socketId}` : `member/${context.userId}`;
      const activity = this.activity.get(connection);
      const state = !activity || activity.idle || Date.now() - activity.activeAt > 45_000 ? 'idle' : !connection.readOnly && Date.now() - activity.editedAt < 5_000 ? 'editing' : 'reading';
      const previous = people.get(id);
      people.set(id, {
        id, name: context.userId === null ? 'Guest' : context.name ?? 'Member',
        access: !connection.readOnly || previous?.access === 'edit' ? 'edit' : 'view', guest: context.userId === null,
        activity: previous?.activity === 'editing' || state === 'editing' ? 'editing' : previous?.activity === 'reading' || state === 'reading' ? 'reading' : 'idle',
      });
    }
    const payload = JSON.stringify({ type: 'presence', people: [...people.values()] });
    if (!changedOnly || this.presencePayloads.get(document.name) !== payload) document.broadcastStateless(payload);
    this.presencePayloads.set(document.name, payload);
  }

  private sendSaved(document: Document) {
    const snapshot = this.savedSnapshots.get(document.name);
    if (snapshot) document.broadcastStateless(JSON.stringify({ type: 'saved', snapshot: Buffer.from(Y.encodeSnapshot(snapshot)).toString('base64') }));
  }

  titleChanged(itemId: string, title: string, updatedAt: Date) {
    this.hocuspocus.documents.get(itemId)?.broadcastStateless(JSON.stringify({ type: 'title', title, updatedAt }));
  }

  private async sendTitle(connection: Connection<RealtimeContext>) {
    const item = await this.prisma.item.findUnique({ where: { id: connection.document.name }, select: { title: true, updatedAt: true } });
    if (item) connection.sendStateless(JSON.stringify({ type: 'title', title: item.title, updatedAt: item.updatedAt }));
  }

  onApplicationBootstrap() {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => this.upgrade(request, socket, head));
    this.recheck = setInterval(() => void this.recheckAccess().catch((error: unknown) => this.logger.error('Could not recheck live page access', error)), recheckMs);
    this.recheck.unref();
    this.presenceTimer = setInterval(() => {
      for (const document of this.hocuspocus.documents.values()) this.sendPresence(document, true);
    }, 5_000);
    this.presenceTimer.unref();
  }

  onModuleDestroy() {
    this.pendingShutdown ??= this.drain();
    return this.pendingShutdown;
  }

  private async saveNow(document: Document) {
    const saved = this.savedSnapshots.get(document.name);
    if (saved && Y.equalSnapshots(saved, Y.snapshot(document)) && !this.hocuspocus.debouncer.isDebounced(`onStoreDocument-${document.name}`) && !this.hocuspocus.debouncer.isCurrentlyExecuting(`onStoreDocument-${document.name}`)) {
      this.sendSaved(document);
      return;
    }
    await this.hocuspocus.storeDocumentHooks(document, {
      instance: this.hocuspocus,
      document,
      documentName: document.name,
      clientsCount: document.getConnectionsCount(),
      lastContext: this.lastEditors.get(document.name),
      lastTransactionOrigin: undefined,
    }, true);
  }

  private async drain() {
    this.closing = true;
    clearInterval(this.recheck);
    clearInterval(this.presenceTimer);
    for (const client of this.sockets.clients) client.pause();
    const documents = [...this.hocuspocus.documents.values()];
    try {
      await Promise.all(documents.flatMap((document) => document.getConnections().map((connection) => connection.waitForPendingMessages())));
      this.hocuspocus.closeConnections();
      await Promise.all(documents.filter((document) => !document.isDestroyed).map((document) => this.saveNow(document)));
      for (const document of documents) {
        if (document.isDestroyed || Y.encodeStateAsUpdate(document).byteLength > maxDocumentBytes) continue;
        const saved = this.savedSnapshots.get(document.name);
        if (!saved || !Y.equalSnapshots(saved, Y.snapshot(document))) throw new Error(`Page ${document.name} could not be saved before shutdown`);
      }
    } finally {
      for (const client of this.sockets.clients) client.terminate();
      await new Promise<void>((resolve) => this.sockets.close(() => resolve()));
      this.savedSnapshots.clear();
      this.lastEditors.clear();
      this.activity.clear();
      this.presencePayloads.clear();
    }
  }

  async syncLinks(noteId: string, document: Y.Doc, userId: string) {
    const { files, mentions } = documentLinks(document);
    for (const [kind, wanted] of [
      [LinkKind.MENTION, mentions],
      [LinkKind.ATTACHMENT, files],
    ] as const) {
      wanted.delete(noteId);
      const existing = await this.prisma.itemLink.findMany({ where: { sourceItemId: noteId, kind }, select: { id: true, targetItemId: true } });
      const stale = existing.filter((link) => !wanted.has(link.targetItemId)).map((link) => link.id);
      if (stale.length) await this.prisma.itemLink.deleteMany({ where: { id: { in: stale } } });
      const known = new Set(existing.map((link) => link.targetItemId));
      for (const targetItemId of [...wanted].filter((id) => !known.has(id)).slice(0, maxLinksPerNote)) {
        const readable = await this.prisma.item.findFirst({ where: { id: targetItemId, OR: [this.access.itemsOf(userId), this.pages.pagesOf(userId)] }, select: { id: true } });
        if (readable) {
          await this.prisma.itemLink.createMany({ data: [{ sourceItemId: noteId, targetItemId, kind, createdById: userId }], skipDuplicates: true });
        }
      }
    }
  }

  async snapshot(itemId: string, state: Uint8Array, userId: string | null, sessionEnded: boolean) {
    if (state.byteLength > maxDocumentBytes) return;
    const latest = await this.prisma.noteVersion.findFirst({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, state: true },
    });
    if (latest && Buffer.compare(Buffer.from(latest.state), Buffer.from(state)) === 0) return;
    if (latest && !sessionEnded && Date.now() - latest.createdAt.getTime() < versionEveryMs) return;
    const empty = Y.encodeStateAsUpdate(new Y.Doc());
    if (!latest && Buffer.compare(Buffer.from(empty), Buffer.from(state)) === 0) return;
    await this.prisma.noteVersion.create({ data: { itemId, state: Buffer.from(state), createdById: userId } });
  }

  async restore(itemId: string, versionState: Uint8Array, context: RealtimeContext) {
    const direct = await this.hocuspocus.openDirectConnection(itemId, context);
    try {
      await this.snapshot(itemId, Y.encodeStateAsUpdate(direct.document!), context.userId, true);
      await direct.transact((document) => {
        const snapshot = new Y.Doc();
        Y.applyUpdate(snapshot, versionState);
        const target = document.getXmlFragment('default');
        target.delete(0, target.length);
        target.insert(
          0,
          snapshot
            .getXmlFragment('default')
            .toArray()
            .filter((node): node is Y.XmlElement | Y.XmlText => !(node instanceof Y.XmlHook))
            .map((node) => node.clone()),
        );
        const board = document.getMap<BoardVersion>(boardElementsKey);
        const restored = snapshot.getMap<BoardVersion>(boardElementsKey);
        const bumped = (id: string, element: BoardVersion, isDeleted: boolean) => ({
          ...element,
          isDeleted,
          version: Math.max(board.get(id)?.version ?? 0, element.version ?? 0) + 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          updated: Date.now(),
        });
        for (const [id, element] of board) if (!restored.has(id)) board.set(id, bumped(id, element, true));
        for (const [id, element] of restored) board.set(id, bumped(id, element, Boolean(element.isDeleted)));
      });
    } finally {
      await direct.disconnect();
    }
  }

  async recheckAccess() {
    const signedIn = new Map<string, Promise<boolean>>();
    for (const [name, document] of this.hocuspocus.documents) {
      for (const connection of document.connections.keys()) {
        const context = connection.context as RealtimeContext | undefined;
        if (!context) continue;
        if (context.userId === null) {
          if (!(await this.liveShareLink(context.shareLinkId))) connection.close({ code: 4403, reason: 'Access changed' });
          continue;
        }
        const sessionKey = `${context.userId}/${context.signedInAt?.toISOString()}`;
        if (!signedIn.has(sessionKey)) signedIn.set(sessionKey, this.stillSignedIn(context));
        if (!(await signedIn.get(sessionKey))) {
          connection.close({ code: 4401, reason: 'Signed out' });
          continue;
        }
        const page = await this.pages
          .assertPage(context.userId, name, 'read')
          .then((found) => (found.trashedAt ? null : { role: found.role, restrictedReferences: !found.permissions.organize }))
          .catch(() => null);
        if (page?.role !== context.role || page?.restrictedReferences !== context.restrictedReferences) connection.close({ code: 4403, reason: 'Access changed' });
      }
    }
  }

  closeShareLink(shareLinkId: string) {
    for (const document of this.hocuspocus.documents.values()) {
      for (const connection of document.connections.keys()) {
        const context = connection.context as RealtimeContext | undefined;
        if (context?.userId === null && context.shareLinkId === shareLinkId) connection.close({ code: 4403, reason: 'Access changed' });
      }
    }
  }

  closePageMember(itemId: string, userId: string) {
    for (const connection of this.hocuspocus.documents.get(itemId)?.connections.keys() ?? []) {
      if (connection.context?.userId === userId) connection.close({ code: 4403, reason: 'Access changed' });
    }
  }

  private async member(token: string, documentName: string) {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.accessTokenSecret, algorithms: ['HS256'] });
    const user = await this.sessions.validate(payload);
    const found = await this.pages.assertPage(user.id, documentName, 'read');
    const item = await this.prisma.item.findUniqueOrThrow({ where: { id: documentName }, select: { kind: true } });
    if (!pageKinds.includes(item.kind) || found.trashedAt) throw new Error('Only pages and boards can be opened here');
    const { signedInAt, user: profile } = await this.prisma.refreshSession.findUniqueOrThrow({ where: { id: payload.sid }, select: { signedInAt: true, user: { select: { displayName: true } } } });
    return { context: { userId: user.id, role: found.role, signedInAt, name: profile.displayName, restrictedReferences: !found.permissions.organize }, readOnly: found.role === SpaceRole.VIEWER };
  }

  private async guest(code: string, documentName: string) {
    const link = await this.prisma.shareLink.findFirst({
      where: { tokenHash: linkTokenHash(code), itemId: documentName, revokedAt: null, expiresAt: { gt: new Date() }, item: { kind: { in: pageKinds }, trashedAt: null } },
      select: { id: true, access: true },
    });
    if (!link) throw new Error('This link has expired or was turned off');
    return { context: { userId: null, shareLinkId: link.id }, readOnly: link.access !== ShareAccess.EDIT };
  }

  private async liveShareLink(id: string) {
    return (await this.prisma.shareLink.count({ where: { id, revokedAt: null, expiresAt: { gt: new Date() }, item: { trashedAt: null } } })) > 0;
  }

  private async stillSignedIn({ userId, signedInAt }: { userId: string; signedInAt?: Date }) {
    const now = Date.now();
    const live = await this.prisma.refreshSession.count({
      where: {
        userId,
        signedInAt,
        expiresAt: { gt: new Date(now) },
        OR: [{ revokedAt: null }, { revokedAt: { gt: new Date(now - refreshReuseGraceMs) } }],
        user: { isActive: true },
      },
    });
    return live > 0;
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== realtimePath) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (this.closing) {
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }
    if (!this.trustedOrigins.includes(request.headers.origin ?? '')) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    this.sockets.handleUpgrade(request, socket, head, (websocket) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') headers.set(key, value);
      }
      const connection = this.hocuspocus.handleConnection(websocket, new Request(new URL(request.url ?? '/', 'http://localhost'), { headers }));
      websocket.on('message', (data: Buffer) => connection.handleMessage(new Uint8Array(data)));
      websocket.on('close', (code: number, reason: Buffer) => connection.handleClose({ code, reason: reason.toString() }));
      websocket.on('error', (error) => this.logger.warn(`Realtime socket error: ${error.message}`));
    });
  }
}
