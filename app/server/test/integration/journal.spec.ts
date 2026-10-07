import { describe, expect, it } from 'vitest';
import { shiftDay } from '../../src/habits/streaks';
import { localDate } from '../../src/recurrence/dates';
import { integrationApp } from './harness';

describe('Journal against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps one page a day under a Journal page in the personal space, with a mood', async () => {
    const writer = await member('diarist');
    const other = await member('reader-of-diaries');
    const today = localDate('Etc/UTC');
    const yesterday = shiftDay(today, -1);

    const first = await writer.call('POST', `/me/journal/${today}/page`);
    expect(first.status).toBe(201);
    expect((await writer.call('POST', `/me/journal/${today}/page`)).body.noteId).toBe(first.body.noteId);
    const [again, racing] = await Promise.all([writer.call('POST', `/me/journal/${yesterday}/page`), writer.call('POST', `/me/journal/${yesterday}/page`)]);
    expect(again.body.noteId).toBe(racing.body.noteId);

    const page = (await writer.call('GET', `/notes/${first.body.noteId}`)).body;
    expect(page.spaceId).toBe(writer.personalSpaceId);
    const parent = (await writer.call('GET', `/notes/${page.parentId}`)).body;
    expect(parent.title).toBe('Journal');
    expect((await writer.call('GET', `/notes/${again.body.noteId}`)).body.parentId).toBe(page.parentId);
    expect(await strata.prisma.item.count({ where: { spaceId: writer.personalSpaceId, kind: 'NOTE' } })).toBe(3);

    expect((await writer.call('PUT', `/me/journal/${today}/mood`, { mood: 6 })).status).toBe(400);
    expect((await writer.call('PUT', `/me/journal/${today}/mood`, { mood: 4 })).body).toEqual({ day: today, mood: 4 });
    expect((await writer.call('PUT', `/me/journal/${shiftDay(today, 2)}/mood`, { mood: 4 })).status).toBe(400);
    expect((await writer.call('POST', '/me/journal/2026-02-30/page')).status).toBe(400);

    const year = (await writer.call('GET', '/me/journal')).body;
    expect(year.today).toBe(today);
    expect(year.days).toEqual(
      expect.arrayContaining([
        { day: today, mood: 4, noteId: first.body.noteId },
        { day: yesterday, mood: null, noteId: again.body.noteId },
      ]),
    );
    expect((await other.call('GET', '/me/journal')).body.days).toEqual([]);
    expect((await other.call('GET', `/notes/${first.body.noteId}`)).status).toBe(404);

    await writer.call('POST', `/items/${first.body.noteId}/trash`);
    const replaced = (await writer.call('POST', `/me/journal/${today}/page`)).body.noteId;
    expect(replaced).not.toBe(first.body.noteId);
    expect((await writer.call('GET', `/notes/${replaced}`)).body.parentId).toBe(page.parentId);
  });

  it('opens one page under one Journal page when the same day is opened twice at once', async () => {
    const writer = await member('hasty-diarist');
    const today = localDate('Etc/UTC');
    const [first, second] = await Promise.all([writer.call('POST', `/me/journal/${today}/page`), writer.call('POST', `/me/journal/${today}/page`)]);

    expect(second.body.noteId).toBe(first.body.noteId);
    expect(await strata.prisma.item.count({ where: { spaceId: writer.personalSpaceId, kind: 'NOTE', trashedAt: null } })).toBe(2);
  });
});
