import { describe, expect, it } from 'vitest';
import { WeeklyReviewService } from '../../src/review/weekly-review.service';
import { integrationApp } from './harness';

const dayMs = 24 * 60 * 60 * 1000;
const utcDate = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10);

describe('Weekly review against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('writes a review page from the past and coming week, under one Weekly reviews page', async () => {
    const owner = await member('reviewer-weekly');
    const space = owner.personalSpaceId;
    const done = (await owner.call('POST', `/spaces/${space}/tasks`, { title: 'File the taxes' })).body;
    await owner.call('POST', `/tasks/${done.id}/complete`);
    await owner.call('POST', `/spaces/${space}/tasks`, { title: 'Call the plumber', dueDate: utcDate(-2) });
    await owner.call('POST', `/spaces/${space}/events`, { title: 'Book club', startsOn: utcDate(3), startTime: '19:00' });
    await owner.call('POST', `/spaces/${space}/habits`, { name: 'Stretch' });

    const first = await owner.call('POST', '/me/weekly-review');
    expect(first.status).toBe(201);
    const page = (await owner.call('GET', `/notes/${first.body.noteId}`)).body;
    expect(page.title).toMatch(/^Week to \d{1,2} \w+ \d{4}$/);
    expect((await owner.call('GET', `/notes/${page.parentId}`)).body.title).toBe('Weekly reviews');
    const text = (await strata.prisma.searchDocument.findUniqueOrThrow({ where: { itemId: first.body.noteId } })).bodyText;
    expect(text).toContain('Done this week');
    expect(text).toContain('File the taxes');
    expect(text).toContain('Call the plumber');
    expect(text).toMatch(/Book club/);
    expect(text).toContain('Stretch: 0 of 7 this week, 0-day streak');

    const second = (await owner.call('POST', '/me/weekly-review')).body;
    expect((await owner.call('GET', `/notes/${second.noteId}`)).body.parentId).toBe(page.parentId);
  });

  it('reminds people who asked for it on Sunday evenings', async () => {
    const keen = await member('reviewer-keen');
    const quiet = await member('reviewer-quiet');
    expect((await keen.call('PATCH', '/me', { weeklyReview: true })).body.weeklyReview).toBe(true);
    const reviews = strata.service(WeeklyReviewService);

    await reviews.scheduleReminders(new Date());
    const jobs = await strata.prisma.scheduledJob.findMany({ where: { kind: 'weekly-review.reminder', doneAt: null } });
    const users = jobs.map((job) => (job.payload as { userId: string }).userId);
    expect(users).toContain(keen.id);
    expect(users).not.toContain(quiet.id);

    await reviews.remind(keen.id);
    await reviews.remind(quiet.id);
    const notice = (await keen.call('GET', '/me/inbox?page=1')).body.results.find((entry: { kind: string }) => entry.kind === 'weekly_review');
    expect(notice).toMatchObject({ title: 'Time for your weekly review', link: '/review' });
    expect((await quiet.call('GET', '/me/inbox?page=1')).body.results).toEqual([]);
  });

  it('keeps one Weekly reviews page when reviews are written at once', async () => {
    const owner = await member('reviewer-hasty');
    const written = await Promise.all(Array.from({ length: 4 }, () => owner.call('POST', '/me/weekly-review')));
    const parents = await Promise.all(written.map(async ({ body }) => (await owner.call('GET', `/notes/${body.noteId}`)).body.parentId));

    expect(new Set(parents).size).toBe(1);
    expect(await strata.prisma.item.count({ where: { spaceId: owner.personalSpaceId, title: 'Weekly reviews' } })).toBe(1);
  });
});
