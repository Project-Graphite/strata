import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { PageFilesController } from '../src/files/page-files.controller';
import { UpdateNoteDto } from '../src/notes/dto/notes.dto';
import { NotesService, present } from '../src/notes/notes.service';

const messages = async (value: object) =>
  (await validate(plainToInstance(UpdateNoteDto, value))).flatMap((error) => Object.values(error.constraints ?? {}));

function setup({ quick = false, organize = true, image = true } = {}) {
  const row = {
    id: 'page', spaceId: 'home', title: 'Trip', kind: ItemKind.NOTE, createdAt: new Date(), updatedAt: new Date(), databaseSchema: null, _count: { journalEntries: 0 },
    note: { parentId: null, position: 1, icon: null, pinnedAt: null, template: false, quick, narrow: false, coverId: null as string | null, coverAlt: '' },
  };
  const upsert = vi.fn(async ({ update }: { update: Record<string, unknown> }) => {
    Object.assign(row.note, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)));
  });
  const findFirst = vi.fn(async () => (image ? { id: 'photo' } : null));
  const transaction = {
    $queryRaw: async () => [],
    item: { findFirst, update: async () => row },
    note: { upsert },
  };
  const prisma = { ...transaction, $transaction: async (work: (client: typeof transaction) => Promise<unknown>) => work(transaction) };
  const page = { id: 'page', spaceId: 'home', title: 'Trip', kind: ItemKind.NOTE, trashedAt: null, quick, permissions: { organize } };
  const notes = new NotesService(prisma as never, {} as never, { record: vi.fn() } as never, { notify: vi.fn() } as never, {} as never, { assertPage: async () => page } as never);
  return { notes, row, upsert, findFirst };
}

describe('page covers and width', () => {
  it('validates the cover, its description and the width', async () => {
    await expect(messages({ cover: null, coverAlt: 'Boats on the Nile', narrow: true })).resolves.toEqual([]);
    await expect(messages({ cover: 'photo' })).resolves.toEqual(['Choose an image from this space.']);
    await expect(messages({ coverAlt: 'x'.repeat(501) })).resolves.toEqual(['Descriptions are at most 500 characters long.']);
    await expect(messages({ narrow: null })).resolves.not.toEqual([]);
  });

  it('sets an image from the same space as the cover with its description and narrows the page', async () => {
    const { notes, findFirst } = setup();
    const saved = await notes.update('me', 'page', { cover: 'photo', coverAlt: 'Boats on the Nile', narrow: true });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'photo', spaceId: 'home', kind: ItemKind.FILE, trashedAt: null, file: { mimeType: { in: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] } } } }));
    expect(saved).toMatchObject({ cover: { id: 'photo', alt: 'Boats on the Nile' }, narrow: true });
  });

  it('clears the description with the cover', async () => {
    const { notes, row } = setup();
    row.note.coverId = 'photo';
    row.note.coverAlt = 'Boats';
    expect(await notes.update('me', 'page', { cover: null })).toMatchObject({ cover: null });
    expect(row.note.coverAlt).toBe('');
  });

  it('refuses files that are not images, covers on notes and covers from page-only editors', async () => {
    await expect(setup({ image: false }).notes.update('me', 'page', { cover: 'report' })).rejects.toThrow(new BadRequestException('Choose an image from this space'));
    await expect(setup({ quick: true }).notes.update('me', 'page', { cover: 'photo' })).rejects.toThrow(new BadRequestException('A note cannot have a cover'));
    const pageOnly = setup({ organize: false });
    await expect(pageOnly.notes.update('me', 'page', { cover: 'photo' })).rejects.toThrow(ForbiddenException);
    await pageOnly.notes.update('me', 'page', { coverAlt: 'Boats', narrow: true });
    expect(pageOnly.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ coverId: undefined, coverAlt: 'Boats', narrow: true }) }));
  });

  it('presents pages as full width without a cover by default', () => {
    expect(present(setup().row)).toMatchObject({ narrow: false, cover: null });
  });
});

describe('page files', () => {
  function controller(cover: boolean) {
    const read = vi.fn(async () => ({ mimeType: 'image/png', sizeBytes: 3, originalName: 'nile.png', inline: true, stream: Readable.from(['png']) }));
    const prisma = {
      note: { findFirst: vi.fn(async () => (cover ? { itemId: 'page' } : null)) },
      itemLink: { findFirst: vi.fn(async () => null) },
      item: { findFirst: vi.fn(async () => ({ id: 'photo' })) },
    };
    const files = new PageFilesController({ read } as never, prisma as never, { assertPage: async () => ({ spaceId: 'home' }) } as never, { hocuspocus: { documents: new Map() } } as never);
    return { files, read };
  }

  it('serves the page cover to page readers', async () => {
    const { files, read } = controller(true);
    await files.download({ id: 'me' } as never, 'page', 'photo', { set: vi.fn() } as never);
    expect(read).toHaveBeenCalledWith('photo');
  });

  it('refuses files that are neither attached nor the cover', async () => {
    const { files, read } = controller(false);
    await expect(files.download({ id: 'me' } as never, 'page', 'photo', { set: vi.fn() } as never)).rejects.toThrow(NotFoundException);
    expect(read).not.toHaveBeenCalled();
  });
});
