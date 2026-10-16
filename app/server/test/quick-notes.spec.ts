import { BadRequestException } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { PageKindQueryDto, UpdateNoteDto } from '../src/notes/dto/notes.dto';
import { NoteDatabasesService } from '../src/notes/note-databases.service';
import { NotesService } from '../src/notes/notes.service';

const messages = async (type: new () => object, value: object) =>
  (await validate(plainToInstance(type, value))).flatMap((error) => Object.values(error.constraints ?? {}));

function setup(quick: boolean) {
  const prisma = {
    item: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ kind: ItemKind.NOTE, note: { quick } }),
    },
  };
  const access = {
    assertSpace: vi.fn(),
    assertItem: vi.fn().mockResolvedValue({ id: 'jot', spaceId: 'home', title: 'Jot', trashedAt: null, role: 'EDITOR' }),
    spacesOf: vi.fn().mockReturnValue({ members: { some: { userId: 'me' } } }),
  };
  const notes = new NotesService(prisma as never, access as never, {} as never, {} as never);
  return { prisma, notes, databases: new NoteDatabasesService(prisma as never, notes) };
}

describe('Notes alongside pages', () => {
  it('turns a note into a page but never a page into a note', async () => {
    await expect(messages(UpdateNoteDto, { quick: false })).resolves.toEqual([]);
    await expect(messages(UpdateNoteDto, { quick: true })).resolves.toEqual(['A page cannot turn into a note.']);
    await expect(messages(PageKindQueryDto, { kind: 'quick' })).resolves.toEqual([]);
  });

  it('refuses a note inside a page, a board as a note and a page inside a note', async () => {
    const { notes, prisma } = setup(false);
    await expect(notes.create('me', 'home', { quick: true, parentId: 'trips' })).rejects.toThrow(new BadRequestException('A note cannot go inside a page'));
    await expect(notes.create('me', 'home', { quick: true, board: true })).rejects.toThrow(new BadRequestException('A board cannot be a note'));
    await expect(notes.create('me', 'home', { parentId: 'jot' })).rejects.toThrow(new BadRequestException('Choose a page from this space'));
    expect(prisma.item.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'jot', note: { quick: false } }) }));
  });

  it('keeps a note free of a parent, a template, an icon and a database', async () => {
    const { notes, databases } = setup(true);
    await expect(notes.update('me', 'jot', { parentId: 'trips' })).rejects.toThrow(new BadRequestException('A note cannot go inside a page'));
    await expect(notes.update('me', 'jot', { template: true })).rejects.toThrow(new BadRequestException('A note cannot be a template'));
    await expect(notes.update('me', 'jot', { icon: '📝' })).rejects.toThrow(new BadRequestException('A note cannot have an icon'));
    await expect(databases.save('me', 'jot', { properties: [], view: 'table' })).rejects.toThrow(new BadRequestException('A note cannot be a database'));
  });

  it('lists notes on their own and leaves them out of pages', async () => {
    const { notes, prisma } = setup(false);
    await notes.everywhere('me', 'quick');
    await notes.everywhere('me', 'note');
    await notes.everywhere('me', undefined);
    await notes.list('me', 'home');
    await notes.mine('me');
    const filters = prisma.item.findMany.mock.calls.map(([query]) => [query.where.kind, query.where.note]);
    expect(filters).toEqual([
      [ItemKind.NOTE, { template: false, quick: true }],
      [ItemKind.NOTE, { template: false, quick: false }],
      [{ in: [ItemKind.NOTE, ItemKind.BOARD] }, { template: false, quick: false }],
      [{ in: [ItemKind.NOTE, ItemKind.BOARD] }, { quick: false }],
      [{ in: [ItemKind.NOTE, ItemKind.BOARD] }, { template: false, quick: false, pinnedAt: { not: null } }],
      [{ in: [ItemKind.NOTE, ItemKind.BOARD] }, { template: false, quick: false, pinnedAt: null }],
    ]);
    expect(prisma.item.findMany.mock.calls[0]![0].orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);
  });
});
