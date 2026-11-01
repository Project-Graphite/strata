import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { ChangesService } from '../changes/changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { inlineTypes } from '../files/file-inspection';
import { valueMap } from './database';
import { boardThumbnail } from './board-thumbnail';
import { boardElementsKey, documentText, pageKinds } from './document-text';
import { CreateNoteDto, PageChildrenQueryDto, UpdateNoteDto } from './dto/notes.dto';
import { importedDocument, templateDocument, textDocument, type BuiltInTemplate } from './templates';
import { readPageDraft } from './page-draft';
import { PageAccessService, type PageAccess } from './page-access.service';

export const noteFields = {
  id: true,
  kind: true,
  spaceId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  note: { select: { parentId: true, position: true, icon: true, pinnedAt: true, template: true, quick: true, narrow: true, coverId: true, coverAlt: true } },
  databaseSchema: { select: { itemId: true } },
  _count: { select: { journalEntries: true, childNotes: { where: { item: { journalEntries: { some: {} } } } } } },
} satisfies Prisma.ItemSelect;

type NoteRow = Prisma.ItemGetPayload<{ select: typeof noteFields }>;

const notJournal = { journalEntries: { none: {} }, childNotes: { none: { item: { journalEntries: { some: {} } } } } } satisfies Prisma.ItemWhereInput;

const visibleParent = { kind: ItemKind.NOTE, trashedAt: null, archivedAt: null, note: { is: { quick: false, template: false } } } satisfies Prisma.ItemWhereInput;

function siblingsOf(parentId: string | null): Prisma.NoteWhereInput {
  return parentId ? { parentId } : { OR: [{ parentId: null }, { parent: { isNot: visibleParent } }] };
}

export function present(row: NoteRow) {
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    kind: row.kind === ItemKind.BOARD ? ('board' as const) : ('note' as const),
    parentId: row.note?.parentId ?? null,
    position: row.note?.position ?? 0,
    icon: row.note?.icon ?? null,
    pinnedAt: row.note?.pinnedAt ?? null,
    template: row.note?.template ?? false,
    quick: row.note?.quick ?? false,
    narrow: row.note?.narrow ?? false,
    cover: row.note?.coverId ? { id: row.note.coverId, alt: row.note.coverAlt } : null,
    database: Boolean(row.databaseSchema),
    journal: row._count.journalEntries > 0,
    holdsJournal: row._count.childNotes > 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly changes: ChangesService,
    private readonly realtime: RealtimeService,
    private readonly pages: PageAccessService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const rows = await this.prisma.item.findMany({
      where: { spaceId, kind: { in: pageKinds }, trashedAt: null, archivedAt: null, note: { quick: false } },
      orderBy: [{ note: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: noteFields,
    });
    return rows.map(present);
  }

  async everywhere(userId: string, kind: 'note' | 'board' | 'quick' | undefined, spaceId?: string) {
    const rows = await this.prisma.item.findMany({
      where: { ...(spaceId ? { spaceId } : {}),
        kind: kind === 'board' ? ItemKind.BOARD : kind === 'note' || kind === 'quick' ? ItemKind.NOTE : { in: pageKinds },
        trashedAt: null,
        archivedAt: null,
        AND: this.pages.pagesOf(userId),
        note: { template: false, quick: kind === 'quick' },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 500,
      select: noteFields,
    });
    return this.visibleRows(userId, rows);
  }

  async children(userId: string, spaceId: string, query: PageChildrenQueryDto) {
    await this.access.assertSpace(userId, spaceId, 'read');
    if (query.parentId) await this.parentIn(spaceId, query.parentId);
    const rows = await this.prisma.item.findMany({
      where: { spaceId, kind: { in: pageKinds }, trashedAt: null, archivedAt: null, ...notJournal, note: { ...siblingsOf(query.parentId ?? null), template: false, quick: false } },
      orderBy: [{ note: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: 101,
      select: noteFields,
    });
    const parents = rows.length
      ? await this.prisma.note.groupBy({
          by: ['parentId'],
          where: { parentId: { in: rows.map((row) => row.id) }, template: false, quick: false, item: { kind: { in: pageKinds }, trashedAt: null, archivedAt: null, ...notJournal } },
        })
      : [];
    const withChildren = new Set(parents.map((parent) => parent.parentId));
    const listed = (row: NoteRow) => ({ ...present(row), hasChildren: withChildren.has(row.id) });
    return { pages: rows.slice(0, 100).map(listed), nextCursor: rows.length > 100 ? rows[99]!.id : null, nextPage: rows[100] ? listed(rows[100]) : null };
  }

  async mine(userId: string, spaceId?: string) {
    const where = { ...(spaceId ? { spaceId } : {}), kind: { in: pageKinds }, trashedAt: null, archivedAt: null, AND: this.pages.pagesOf(userId) };
    const [pinned, recent] = await Promise.all([
      this.prisma.item.findMany({
        where: { ...where, note: { template: false, quick: false, pinnedAt: { not: null } } },
        orderBy: [{ note: { pinnedAt: 'desc' } }, { id: 'asc' }],
        take: 8,
        select: noteFields,
      }),
      this.prisma.item.findMany({
        where: { ...where, note: { template: false, quick: false, pinnedAt: null } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: 5,
        select: noteFields,
      }),
    ]);
    return { pinned: await this.visibleRows(userId, pinned), recent: await this.visibleRows(userId, recent) };
  }

  async create(userId: string, spaceId: string, input: CreateNoteDto, document?: Y.Doc, recoveryId?: string) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    if (input.quick && input.board) throw new BadRequestException('A board cannot be a note');
    if (input.quick && input.parentId) throw new BadRequestException('A note cannot go inside a page');
    const initial = document ?? (await this.initialState(spaceId, input));
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "spaces" WHERE "id" = ${spaceId}::uuid FOR NO KEY UPDATE`;
      if (recoveryId) {
        const existing = await transaction.item.findUnique({ where: { id: recoveryId }, select: { ...noteFields, createdById: true, trashedAt: true, archivedAt: true } });
        if (existing) {
          if (existing.spaceId !== spaceId || existing.createdById !== userId || existing.kind !== (input.board ? ItemKind.BOARD : ItemKind.NOTE) || existing.trashedAt || existing.archivedAt) throw new ConflictException('That recovery ID is already in use. Start a new recovery.');
          return { item: existing, created: false };
        }
      }
      if (input.parentId) await this.parentIn(spaceId, input.parentId, transaction);
      const last = await transaction.note.aggregate({
        where: { ...siblingsOf(input.parentId ?? null), item: { spaceId, trashedAt: null, archivedAt: null } },
        _max: { position: true },
      });
      const item = await transaction.item.create({
        data: {
          id: recoveryId,
          spaceId,
          kind: input.board ? ItemKind.BOARD : ItemKind.NOTE,
          title: input.title ?? '',
          createdById: userId,
          updatedById: userId,
          note: { create: { parentId: input.parentId ?? null, position: (last._max.position ?? 0) + 1, quick: input.quick } },
        },
        select: noteFields,
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title: item.title } });
      if (initial) {
        await transaction.noteDocument.create({ data: { itemId: item.id, state: Buffer.from(Y.encodeStateAsUpdate(initial)) } });
        await transaction.searchDocument.updateMany({ where: { itemId: item.id }, data: { bodyText: documentText(initial) } });
      }
      return { item, created: true };
    });
    if (result.created && input.state && initial) await this.realtime.syncLinks(result.item.id, initial, userId);
    this.changes.notify('page-details', { spaceId, itemId: input.parentId });
    return present(result.item);
  }

  async recover(userId: string, spaceId: string, bytes: Buffer, recoveryId?: string) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const draft = readPageDraft(bytes);
    try {
      return await this.create(userId, spaceId, { title: draft.title, board: draft.board, state: draft.state }, draft.document, recoveryId);
    } finally {
      draft.document.destroy();
    }
  }

  async get(userId: string, noteId: string) {
    const found = await this.note(userId, noteId, 'read');
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: noteId }, select: noteFields });
    const parentId = row.note?.parentId ?? null;
    const parentReadable = parentId && await this.prisma.item.findFirst({ where: { id: parentId, AND: this.pages.pagesOf(userId) }, select: { id: true } });
    const database = parentReadable ? await this.prisma.databaseSchema.findUnique({ where: { itemId: parentId! }, select: { properties: true } }) : null;
    const path = await this.ancestors(parentId);
    const readable = new Set((await this.prisma.item.findMany({ where: { id: { in: path.map((ancestor) => ancestor.id) }, AND: this.pages.pagesOf(userId) }, select: { id: true } })).map((ancestor) => ancestor.id));
    return {
      ...present(row),
      parentId: parentReadable ? parentId : null,
      editable: found.permissions.edit,
      permissions: found.permissions,
      path: path.slice(path.findLastIndex((ancestor) => !ancestor.visible || !readable.has(ancestor.id)) + 1).map(({ id, title }) => ({ id, title })),
      row: database
        ? { properties: database.properties, values: valueMap(await this.prisma.noteProperty.findMany({ where: { itemId: noteId } })) }
        : null,
    };
  }

  async board(userId: string, boardId: string) {
    await this.note(userId, boardId, 'read', [ItemKind.BOARD]);
    const stored = await this.prisma.noteDocument.findUnique({ where: { itemId: boardId }, select: { state: true } });
    const document = new Y.Doc();
    if (stored) Y.applyUpdate(document, new Uint8Array(stored.state));
    const elements = [...document.getMap<{ isDeleted?: boolean }>(boardElementsKey).values()].filter((element) => !element.isDeleted);
    return { elements };
  }

  async boardThumbnail(userId: string, boardId: string) {
    await this.note(userId, boardId, 'read', [ItemKind.BOARD]);
    const stored = await this.prisma.noteDocument.findUnique({ where: { itemId: boardId }, select: { thumbnail: true } });
    if (!stored || stored.thumbnail !== null) return { thumbnail: stored?.thumbnail || null };
    const { state } = await this.prisma.noteDocument.findUniqueOrThrow({ where: { itemId: boardId }, select: { state: true } });
    const document = new Y.Doc();
    try {
      Y.applyUpdate(document, new Uint8Array(state));
      const thumbnail = boardThumbnail(document);
      await this.prisma.noteDocument.updateMany({ where: { itemId: boardId, thumbnail: null }, data: { thumbnail } });
      return { thumbnail: thumbnail || null };
    } finally {
      document.destroy();
    }
  }

  async update(userId: string, noteId: string, input: UpdateNoteDto) {
    const found = await this.note(userId, noteId, 'edit');
    if (!found.permissions.organize && (input.parentId !== undefined || input.position !== undefined || input.relativeTo !== undefined || input.template !== undefined || input.quick !== undefined || input.pinned !== undefined || input.cover !== undefined)) throw new ForbiddenException('Space editing access is required to organize pages');
    if (found.trashedAt) throw new BadRequestException('Restore this page from the trash before changing it');
    if (input.expectedTitle !== undefined && input.title === undefined) throw new BadRequestException('Include a title when checking its previous value');
    if (input.template && found.kind === ItemKind.BOARD) throw new BadRequestException('A board cannot be a template');
    if (found.quick && input.parentId) throw new BadRequestException('A note cannot go inside a page');
    if (found.quick && input.template) throw new BadRequestException('A note cannot be a template');
    if (found.quick && input.icon) throw new BadRequestException('A note cannot have an icon');
    if (found.quick && input.cover) throw new BadRequestException('A note cannot have a cover');
    if (input.cover && !(await this.prisma.item.findFirst({ where: { id: input.cover, spaceId: found.spaceId, kind: ItemKind.FILE, trashedAt: null, file: { mimeType: { in: [...inlineTypes] } } }, select: { id: true } }))) {
      throw new BadRequestException('Choose an image from this space');
    }
    if (Boolean(input.relativeTo) !== Boolean(input.placement) || (input.relativeTo && (input.parentId !== undefined || input.position !== undefined))) {
      throw new BadRequestException('Choose either a destination page or a sibling placement');
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (input.parentId !== undefined || input.position !== undefined || input.relativeTo) {
        await transaction.$queryRaw`SELECT 1 FROM "spaces" WHERE "id" = ${found.spaceId}::uuid FOR NO KEY UPDATE`;
      }
      await transaction.$queryRaw`SELECT 1 FROM "items" WHERE "id" = ${noteId}::uuid FOR UPDATE`;
      await this.pages.assertPage(userId, noteId, 'edit', transaction);
      let parentId = input.parentId;
      let position = input.position;
      if (input.relativeTo) {
        if (input.relativeTo === noteId || found.quick) throw new BadRequestException('Choose a different page to move beside');
        const anchor = await transaction.note.findFirst({
          where: { itemId: input.relativeTo, quick: false, template: false, item: { spaceId: found.spaceId, kind: { in: pageKinds }, trashedAt: null, archivedAt: null } },
          select: { parentId: true },
        });
        if (!anchor) throw new BadRequestException('Choose a page from this space');
        parentId = anchor.parentId;
        if (parentId && !(await transaction.item.findFirst({ where: { id: parentId, spaceId: found.spaceId, ...visibleParent }, select: { id: true } }))) parentId = null;
        const siblings = await transaction.note.findMany({
          where: { ...siblingsOf(parentId), quick: false, template: false, itemId: { not: noteId }, item: { spaceId: found.spaceId, trashedAt: null, archivedAt: null } },
          orderBy: [{ position: 'asc' }, { item: { createdAt: 'asc' } }, { itemId: 'asc' }],
          select: { itemId: true, position: true },
        });
        if (siblings.some((sibling, index) => !Number.isFinite(sibling.position) || (index > 0 && sibling.position - siblings[index - 1]!.position < 0.000001))) {
          for (const [index, sibling] of siblings.entries()) {
            sibling.position = index + 1;
            await transaction.note.update({ where: { itemId: sibling.itemId }, data: { position: sibling.position } });
          }
        }
        const index = siblings.findIndex((sibling) => sibling.itemId === input.relativeTo);
        if (index < 0) throw new ConflictException('The page tree changed. Try the move again.');
        const target = siblings[index]!;
        const neighbour = siblings[index + (input.placement === 'before' ? -1 : 1)];
        position = neighbour ? (target.position + neighbour.position) / 2 : target.position + (input.placement === 'before' ? -1 : 1);
      }
      if (parentId) {
        await this.parentIn(found.spaceId, parentId, transaction);
        if (parentId === noteId || (await this.ancestors(parentId, transaction)).some((ancestor) => ancestor.id === noteId)) {
          throw new BadRequestException('A page cannot move inside itself');
        }
      }
      if (parentId !== undefined && position === undefined) {
        const last = await transaction.note.aggregate({ where: { ...siblingsOf(parentId), itemId: { not: noteId }, item: { spaceId: found.spaceId, trashedAt: null, archivedAt: null } }, _max: { position: true } });
        position = (last._max.position ?? 0) + 1;
      }
      if (input.expectedTitle !== undefined && (await transaction.item.updateMany({
        where: { id: noteId, title: input.expectedTitle },
        data: { title: input.title },
      })).count !== 1) throw new ConflictException('Someone renamed this page. Your draft is kept; choose which title to use.');
      await transaction.note.upsert({
        where: { itemId: noteId },
        create: {
          itemId: noteId,
          parentId: parentId ?? null,
          position: position ?? 0,
          icon: input.icon ?? null,
          pinnedAt: input.pinned ? new Date() : null,
          template: input.template ?? false,
          narrow: input.narrow ?? false,
          coverId: input.cover ?? null,
          coverAlt: input.coverAlt ?? '',
        },
        update: {
          parentId,
          position,
          icon: input.icon,
          narrow: input.narrow,
          coverId: input.cover,
          coverAlt: input.cover === null ? '' : input.coverAlt,
          pinnedAt: input.pinned === undefined ? undefined : input.pinned ? new Date() : null,
          template: input.template,
          quick: input.quick,
        },
      });
      const item = await transaction.item.update({
        where: { id: noteId },
        data: { title: input.title, updatedById: userId },
        select: noteFields,
      });
      if (input.title !== undefined && input.title !== found.title) {
        await this.activity.record(transaction, {
          spaceId: found.spaceId,
          actorId: userId,
          itemId: noteId,
          verb: 'item.updated',
          data: { title: input.title, renamedFrom: found.title },
        });
      }
      return item;
    });
    this.changes.notify('page-details', { spaceId: found.spaceId, itemId: noteId });
    if (input.title !== undefined) this.realtime.titleChanged(noteId, updated.title, updated.updatedAt);
    return present(updated);
  }

  async note(userId: string, noteId: string, access: PageAccess, kinds: ItemKind[] = pageKinds) {
    const found = await this.pages.assertPage(userId, noteId, access);
    if (!kinds.includes(found.kind)) throw new NotFoundException('Note not found');
    return found;
  }

  private async visibleRows(userId: string, rows: NoteRow[]) {
    if (!rows.some((row) => row.note?.parentId)) return rows.map(present);
    const readable = new Set((await this.prisma.item.findMany({ where: { id: { in: rows.flatMap((row) => row.note?.parentId ? [row.note.parentId] : []) }, AND: this.pages.pagesOf(userId) }, select: { id: true } })).map((row) => row.id));
    return rows.map((row) => ({ ...present(row), parentId: row.note?.parentId && readable.has(row.note.parentId) ? row.note.parentId : null }));
  }

  private async initialState(spaceId: string, input: CreateNoteDto) {
    if (input.board) {
      if (input.template || input.fromNoteId || input.text || input.state) throw new BadRequestException('A board starts empty');
      return null;
    }
    if (input.state) return importedDocument(input.state);
    if (input.template) return templateDocument(input.template as BuiltInTemplate);
    if (input.text?.trim()) return textDocument(input.text.trim());
    if (!input.fromNoteId) return null;
    const source = await this.prisma.note.findFirst({
      where: { itemId: input.fromNoteId, template: true, item: { spaceId, trashedAt: null } },
      select: { item: { select: { noteDocument: { select: { state: true } } } } },
    });
    if (!source) throw new BadRequestException('Choose a template from this space');
    const document = new Y.Doc();
    if (source.item.noteDocument) Y.applyUpdate(document, new Uint8Array(source.item.noteDocument.state));
    return document;
  }

  private async parentIn(spaceId: string, parentId: string, transaction: Prisma.TransactionClient = this.prisma) {
    const parent = await transaction.item.findFirst({
      where: { id: parentId, spaceId, kind: ItemKind.NOTE, trashedAt: null, note: { quick: false } },
      select: { id: true },
    });
    if (!parent) throw new BadRequestException('Choose a page from this space');
  }

  private async ancestors(parentId: string | null, transaction: Prisma.TransactionClient = this.prisma) {
    const path: { id: string; title: string; visible: boolean }[] = [];
    let current = parentId;
    while (current) {
      if (path.some((step) => step.id === current)) throw new BadRequestException('The page hierarchy contains a cycle');
      const row: { id: string; title: string; kind: ItemKind; trashedAt: Date | null; archivedAt: Date | null; note: { parentId: string | null; quick: boolean; template: boolean } | null } | null = await transaction.item.findUnique({
        where: { id: current },
        select: { id: true, title: true, kind: true, trashedAt: true, archivedAt: true, note: { select: { parentId: true, quick: true, template: true } } },
      });
      if (!row) break;
      path.unshift({ id: row.id, title: row.title, visible: row.kind === ItemKind.NOTE && !row.trashedAt && !row.archivedAt && Boolean(row.note && !row.note.quick && !row.note.template) });
      current = row.note?.parentId ?? null;
    }
    return path;
  }
}
