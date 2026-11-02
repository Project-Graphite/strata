import { describe, expect, it } from 'vitest';
import { shiftDay } from '../../src/habits/streaks';
import { localDate } from '../../src/recurrence/dates';
import { integrationApp } from './harness';

describe('Journal against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps one page a day owned by the account, outside every space and page tree, with a mood', async () => {
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
    expect(page).toMatchObject({ spaceId: null, parentId: null, permissions: { edit: true, history: true, comment: false, share: false, organize: false } });
    expect(await strata.prisma.item.count({ where: { ownerId: writer.id, kind: 'NOTE' } })).toBe(2);
    expect(await strata.prisma.item.count({ where: { spaceId: writer.personalSpaceId, kind: 'NOTE' } })).toBe(0);
    expect((await writer.call('GET', '/me/notes?kind=note')).body).toEqual([]);
    expect((await writer.call('PATCH', `/notes/${page.id}`, { title: 'A long day', narrow: true })).body).toMatchObject({ title: 'A long day', narrow: true });
    expect((await writer.call('PATCH', `/notes/${page.id}`, { pinned: true })).status).toBe(403);
    expect((await writer.call('POST', `/notes/${page.id}/comments`, { body: 'Hello' })).status).toBe(403);

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
    expect((await writer.call('GET', `/notes/${replaced}`)).body).toMatchObject({ spaceId: null, parentId: null });
  });

  it('summarises a day without writing its page', async () => {
    const writer = await member('day-reader');
    const other = await member('day-stranger');
    const today = localDate('Etc/UTC');
    const task = (await writer.call('POST', `/spaces/${writer.personalSpaceId}/tasks`, { title: 'Post the letters' })).body;
    await writer.call('POST', `/tasks/${task.id}/complete`);
    await writer.call('POST', `/spaces/${writer.personalSpaceId}/tasks`, { title: 'Still open' });
    const habit = (await writer.call('POST', '/me/habits', { name: 'Read' })).body;
    await writer.call('PUT', `/habits/${habit.id}/check-ins/${today}`);
    await writer.call('PUT', `/me/journal/${today}/mood`, { mood: 5 });

    const day = await writer.call('GET', `/me/journal/${today}`);
    expect(day.status).toBe(200);
    expect(day.body).toMatchObject({ day: today, mood: 5, page: null, tasks: [{ id: task.id, title: 'Post the letters' }], habits: [{ id: habit.id, name: 'Read' }], transactions: [] });
    expect(await strata.prisma.item.count({ where: { ownerId: writer.id, kind: 'NOTE' } })).toBe(0);

    const noteId = (await writer.call('POST', `/me/journal/${today}/page`)).body.noteId;
    expect((await writer.call('GET', `/me/journal/${today}`)).body.page).toEqual({ id: noteId, title: expect.any(String), preview: '' });
    expect((await other.call('GET', `/me/journal/${today}`)).body).toMatchObject({ mood: null, page: null, tasks: [], habits: [] });
    expect((await writer.call('GET', `/me/journal/${shiftDay(today, 1)}`)).status).toBe(400);
  });

  it('opens one page when the same day is opened twice at once', async () => {
    const writer = await member('hasty-diarist');
    const today = localDate('Etc/UTC');
    const [first, second] = await Promise.all([writer.call('POST', `/me/journal/${today}/page`), writer.call('POST', `/me/journal/${today}/page`)]);

    expect(second.body.noteId).toBe(first.body.noteId);
    expect(await strata.prisma.item.count({ where: { ownerId: writer.id, kind: 'NOTE', trashedAt: null } })).toBe(1);
  });
});
