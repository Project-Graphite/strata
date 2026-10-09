import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { LinkKind, SpaceRole } from '@prisma/client';
import { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { AccessService } from '../access/access.service';
import { refreshReuseGraceMs } from '../auth/auth.service';
import { JwtStrategy, type AccessTokenPayload } from '../auth/jwt.strategy';
import { boardElementsKey, documentLinks, documentText } from '../notes/document-text';
import { pageKinds } from '../notes/notes.service';
import { PrismaService } from '../prisma/prisma.service';

export const realtimePath = '/api/v1/realtime';
const maxUpdateBytes = 2 * 1024 * 1024;
const maxDocumentBytes = 5 * 1024 * 1024;
const maxDocumentsPerUser = 40;
const recheckMs = 60_000;
const versionEveryMs = 15 * 60 * 1000;
const maxLinksPerNote = 200;
export const editorFormat = 3;

interface BoardVersion {
  version?: number;
  isDeleted?: boolean;
}

export interface RealtimeContext {
  userId: string;
  role: SpaceRole;
  signedInAt?: Date;
}

function rejectUpgrade(socket: Duplex, status: number, reason: string) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: maxUpdateBytes });
  private readonly documentsPerUser = new Map<string, Set<string>>();
  private readonly trustedOrigins: string[];
  private recheck?: NodeJS.Timeout;
  readonly hocuspocus: Hocuspocus<RealtimeContext>;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly jwt: JwtService,
    private readonly sessions: JwtStrategy,
    config: ConfigService,
  ) {
    this.trustedOrigins = config.get<string>('AUTH_TRUSTED_ORIGINS')?.split(',') ?? [];
    const secret = config.getOrThrow<string>('AUTH_ACCESS_TOKEN_SECRET');
    this.hocuspocus = new Hocuspocus<RealtimeContext>({
      quiet: true,
      debounce: 2_000,
      maxDebounce: 10_000,
      onAuthenticate: async ({ connectionConfig, documentName, requestParameters, socketId, token }) => {
        if (Number(requestParameters.get('format')) < editorFormat) throw Object.assign(new Error('outdated'), { reason: 'outdated' });
        const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret, algorithms: ['HS256'] });
        const user = await this.sessions.validate(payload);
        const found = await this.access.assertItem(user.id, documentName, 'read');
        const item = await this.prisma.item.findUniqueOrThrow({ where: { id: documentName }, select: { kind: true } });
        if (!pageKinds.includes(item.kind) || found.trashedAt) throw new Error('Only pages and boards can be opened here');
        const { signedInAt } = await this.prisma.refreshSession.findUniqueOrThrow({ where: { id: payload.sid }, select: { signedInAt: true } });
        const open = this.documentsPerUser.get(user.id) ?? new Set<string>();
        const key = `${socketId}/${documentName}`;
        if (!open.has(key) && open.size >= maxDocumentsPerUser) throw new Error('Too many open documents');
        open.add(key);
        this.documentsPerUser.set(user.id, open);
        connectionConfig.readOnly = found.role === SpaceRole.VIEWER;
        return { userId: user.id, role: found.role, signedInAt };
      },
      onLoadDocument: async ({ document, documentName }) => {
        const stored = await this.prisma.noteDocument.findUnique({ where: { itemId: documentName }, select: { state: true } });
        if (stored) Y.applyUpdate(document, new Uint8Array(stored.state));
        return document;
      },
      onStoreDocument: async ({ clientsCount, document, documentName, lastContext }) => {
        const state = Y.encodeStateAsUpdate(document);
        if (state.byteLength > maxDocumentBytes) {
          this.logger.warn(`Note ${documentName} is over the size limit and was not saved`);
          document.broadcastStateless(JSON.stringify({ type: 'too-large' }));
          for (const connection of document.getConnections()) connection.close({ code: 4413, reason: 'This page is too large' });
          return;
        }
        await this.prisma.$transaction([
          this.prisma.noteDocument.upsert({
            where: { itemId: documentName },
            create: { itemId: documentName, state: Buffer.from(state) },
            update: { state: Buffer.from(state) },
          }),
          this.prisma.searchDocument.updateMany({ where: { itemId: documentName }, data: { bodyText: documentText(document), updatedAt: new Date() } }),
          this.prisma.item.update({
            where: { id: documentName },
            data: { updatedById: lastContext?.userId ?? undefined, updatedAt: new Date() },
          }),
        ]);
        if (lastContext?.userId) await this.syncLinks(documentName, document, lastContext.userId);
        await this.snapshot(documentName, state, lastContext?.userId ?? null, clientsCount === 0);
      },
      onDisconnect: async ({ clientsCount, context, document, documentName, socketId }) => {
        if (!context) return;
        if (clientsCount === 0) await this.snapshot(documentName, Y.encodeStateAsUpdate(document), context.userId, true);
        const open = this.documentsPerUser.get(context.userId);
        open?.delete(`${socketId}/${documentName}`);
        if (open?.size === 0) this.documentsPerUser.delete(context.userId);
      },
    });
  }

  onApplicationBootstrap() {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => this.upgrade(request, socket, head));
    this.recheck = setInterval(() => void this.recheckAccess(), recheckMs);
    this.recheck.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.recheck);
    this.hocuspocus.closeConnections();
    this.hocuspocus.flushPendingStores();
    for (const client of this.sockets.clients) client.terminate();
    this.sockets.close();
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
        const readable = await this.access.assertItem(userId, targetItemId, 'read').then(
          () => true,
          () => false,
        );
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
        const sessionKey = `${context.userId}/${context.signedInAt?.toISOString()}`;
        if (!signedIn.has(sessionKey)) signedIn.set(sessionKey, this.stillSignedIn(context));
        if (!(await signedIn.get(sessionKey))) {
          connection.close({ code: 4401, reason: 'Signed out' });
          continue;
        }
        const role = await this.access
          .assertItem(context.userId, name, 'read')
          .then((found) => (found.trashedAt ? null : found.role))
          .catch(() => null);
        if (role !== context.role) connection.close({ code: 4403, reason: 'Access changed' });
      }
    }
  }

  private async stillSignedIn({ userId, signedInAt }: RealtimeContext) {
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
