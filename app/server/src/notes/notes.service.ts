import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma, SpaceRole } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/notes.dto';

const noteFields = {
  id: true,
  spaceId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  note: { select: { parentId: true, position: true, icon: true, pinnedAt: true } },
} satisfies Prisma.ItemSelect;

type NoteRow = Prisma.ItemGetPayload<{ select: typeof noteFields }>;

function present(row: NoteRow) {
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    parentId: row.note?.parentId ?? null,
    position: row.note?.position ?? 0,
    icon: row.note?.icon ?? null,
    pinnedAt: row.note?.pinnedAt ?? null,
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
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const rows = await this.prisma.item.findMany({
      where: { spaceId, kind: ItemKind.NOTE, trashedAt: null, archivedAt: null },
      orderBy: [{ note: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: noteFields,
    });
    return rows.map(present);
  }

  async create(userId: string, spaceId: string, input: CreateNoteDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    if (input.parentId) await this.parentIn(spaceId, input.parentId);
    const last = await this.prisma.note.aggregate({
      where: { parentId: input.parentId ?? null, item: { spaceId, trashedAt: null } },
      _max: { position: true },
    });
    const created = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: {
          spaceId,
          kind: ItemKind.NOTE,
          title: input.title ?? '',
          createdById: userId,
          updatedById: userId,
          note: { create: { parentId: input.parentId ?? null, position: (last._max.position ?? 0) + 1 } },
        },
        select: noteFields,
      });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title: item.title } });
      return item;
    });
    return present(created);
  }

  async get(userId: string, noteId: string) {
    const found = await this.note(userId, noteId, 'read');
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: noteId }, select: noteFields });
    return { ...present(row), editable: found.role !== SpaceRole.VIEWER, path: await this.ancestors(row.note?.parentId ?? null) };
  }

  async update(userId: string, noteId: string, input: UpdateNoteDto) {
    const found = await this.note(userId, noteId, 'edit');
    if (found.trashedAt) throw new BadRequestException('Restore this page from the trash before changing it');
    if (input.parentId) {
      await this.parentIn(found.spaceId, input.parentId);
      if (input.parentId === noteId || (await this.ancestors(input.parentId)).some((ancestor) => ancestor.id === noteId)) {
        throw new BadRequestException('A page cannot move inside itself');
      }
    }
    const moved = input.parentId !== undefined && input.position === undefined;
    const last = moved
      ? await this.prisma.note.aggregate({
          where: { parentId: input.parentId, itemId: { not: noteId }, item: { spaceId: found.spaceId, trashedAt: null } },
          _max: { position: true },
        })
      : null;
    const position = last ? (last._max.position ?? 0) + 1 : input.position;
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.note.upsert({
        where: { itemId: noteId },
        create: {
          itemId: noteId,
          parentId: input.parentId ?? null,
          position: position ?? 0,
          icon: input.icon ?? null,
          pinnedAt: input.pinned ? new Date() : null,
        },
        update: {
          parentId: input.parentId,
          position,
          icon: input.icon,
          pinnedAt: input.pinned === undefined ? undefined : input.pinned ? new Date() : null,
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
    return present(updated);
  }

  async note(userId: string, noteId: string, access: 'read' | 'edit') {
    const found = await this.access.assertItem(userId, noteId, access);
    const item = await this.prisma.item.findUniqueOrThrow({ where: { id: noteId }, select: { kind: true } });
    if (item.kind !== ItemKind.NOTE) throw new NotFoundException('Note not found');
    return found;
  }

  private async parentIn(spaceId: string, parentId: string) {
    const parent = await this.prisma.item.findFirst({
      where: { id: parentId, spaceId, kind: ItemKind.NOTE, trashedAt: null },
      select: { id: true },
    });
    if (!parent) throw new BadRequestException('Choose a page from this space');
  }

  private async ancestors(parentId: string | null) {
    const path: { id: string; title: string }[] = [];
    let current = parentId;
    while (current && path.length < 50) {
      const row: { id: string; title: string; note: { parentId: string | null } | null } | null = await this.prisma.item.findUnique({
        where: { id: current },
        select: { id: true, title: true, note: { select: { parentId: true } } },
      });
      if (!row || path.some((step) => step.id === row.id)) break;
      path.unshift({ id: row.id, title: row.title });
      current = row.note?.parentId ?? null;
    }
    return path;
  }
}
