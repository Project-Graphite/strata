import { NotFoundException } from '@nestjs/common';
import { ItemKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { addressOf, noteHref } from '../../frontend/src/notes';
import { NoteAddressPipe } from '../src/validation/note-address.pipe';
import { watchedLink } from '../src/watchers/watchers.service';

const id = '10000000-0000-4000-8000-000000000001';

describe('short page and board addresses', () => {
  it('links pages, boards and journal pages by their short address', () => {
    expect(noteHref({ id, slug: '0a1b2c3d4e', kind: 'note' })).toBe('/pages/0a1b2c3d4e');
    expect(noteHref({ id, slug: '0a1b2c3d4e', kind: 'board' })).toBe('/boards/0a1b2c3d4e');
    expect(noteHref({ id, slug: '0a1b2c3d4e', kind: 'note', journal: true })).toBe('/journal/0a1b2c3d4e');
    expect(noteHref({ id, kind: 'note' })).toBe(`/pages/${id}`);
  });

  it('opens a page at either address so old links still resolve', () => {
    expect(addressOf({ id, slug: '0a1b2c3d4e' }, id)).toBe(true);
    expect(addressOf({ id, slug: '0a1b2c3d4e' }, '0a1b2c3d4e')).toBe(true);
    expect(addressOf({ id, slug: '0a1b2c3d4e' }, 'ffffffffff')).toBe(false);
  });

  it('accepts only an ID or a short address', () => {
    const pipe = new NoteAddressPipe();
    expect(pipe.transform(id)).toBe(id);
    expect(pipe.transform('0a1b2c3d4e')).toBe('0a1b2c3d4e');
    expect(() => pipe.transform('../etc')).toThrow(NotFoundException);
    expect(() => pipe.transform('0A1B2C3D4E')).toThrow(NotFoundException);
  });

  it('puts short addresses in notification links', () => {
    expect(watchedLink({ id, kind: ItemKind.NOTE, spaceId: null, note: { slug: '0a1b2c3d4e' } })).toBe('/pages/0a1b2c3d4e');
    expect(watchedLink({ id, kind: ItemKind.BOARD, spaceId: null, note: { slug: '0a1b2c3d4e' } })).toBe('/boards/0a1b2c3d4e');
    expect(watchedLink({ id, kind: ItemKind.TASK, spaceId: null, note: null })).toBe(`/tasks?task=${id}`);
  });
});
