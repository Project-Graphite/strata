import { ItemKind, SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { TidyRulesService } from '../../src/tidy/tidy-rules.service';
import { TidyService } from '../../src/tidy/tidy.service';
import { integrationApp, type Member } from './harness';

const dayMs = 24 * 60 * 60 * 1000;
const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);

describe('Tidy against Postgres', () => {
  const strata = integrationApp();
  const { member, upload } = strata;

  async function file(as: Member, spaceId: string, name: string, data: Buffer) {
    return (await (await upload(as, spaceId, name, data)).json()) as { id: string };
  }

  function subscription(as: Member, spaceId: string, name: string, category: string) {
    return as
      .call('POST', `/spaces/${spaceId}/subscriptions`, {
        name,
        amountMinor: 1000,
        currency: 'EUR',
        repeatRule: 'FREQ=MONTHLY',
        startDate: '2026-01-10',
        category,
      })
      .then((reply) => reply.body as { id: string });
  }

  it('finds duplicate, large and old uploads and overlapping subscriptions only where you can edit', async () => {
    const owner = await member('sorter');
    const host = await member('host');
    const club = (await host.call('POST', '/spaces', { name: 'Club' })).body;
    await strata.join(club.id, owner, SpaceRole.VIEWER);
    const copy = Buffer.from(`same words ${owner.id}`);
    const first = await file(owner, owner.personalSpaceId, 'notes.txt', copy);
    const second = await file(owner, owner.personalSpaceId, 'notes (1).txt', copy);
    await file(host, club.id, 'notes.txt', copy);
    const big = await file(owner, owner.personalSpaceId, 'big.txt', Buffer.concat([Buffer.alloc(5 * 1024 * 1024, 0x61), Buffer.from(owner.id)]));
    const dusty = await file(owner, owner.personalSpaceId, 'old.txt', Buffer.from(`old ${owner.id}`));
    await strata.prisma.item.update({ where: { id: dusty.id }, data: { updatedAt: new Date(Date.now() - 400 * dayMs) } });
    const music = await subscription(owner, owner.personalSpaceId, 'Music', 'music');
    const again = await subscription(owner, owner.personalSpaceId, ' music ', 'music');
    await subscription(owner, owner.personalSpaceId, 'Misc', 'other');
    await subscription(owner, owner.personalSpaceId, 'Odds', 'other');
    await subscription(host, club.id, 'Radio', 'music');
    await strata.prisma.item.update({ where: { id: music.id }, data: { createdAt: new Date(Date.now() - 90 * dayMs) } });

    const scan = (await owner.call('GET', '/tidy/scan')).body;
    expect(scan.files.duplicates).toEqual([
      { sizeBytes: copy.length, savingBytes: copy.length, items: [expect.objectContaining({ id: first.id }), expect.objectContaining({ id: second.id })] },
    ]);
    expect(ids(scan.files.large)).toEqual([big.id]);
    expect(ids(scan.files.old)).toEqual([dusty.id]);
    expect(ids(scan.subscriptions.unused)).toEqual([music.id]);
    expect(scan.subscriptions.duplicates).toHaveLength(1);
    expect(ids(scan.subscriptions.duplicates[0].items).sort()).toEqual([music.id, again.id].sort());
    expect(scan.subscriptions.overlapping.map((group: { category: string }) => group.category)).toEqual(['music']);
    expect(scan.subscriptions.overlapping[0].items[0]).toMatchObject({ yearlyMinor: 12_000, currency: 'EUR' });

    const theirs = (await host.call('GET', '/tidy/scan')).body;
    expect(theirs.files.duplicates).toEqual([]);
    expect(theirs.subscriptions.overlapping).toEqual([]);
  });

  it('previews exactly what will change, applies it and undoes it once', async () => {
    const owner = await member('cleaner');
    const host = await member('lender');
    const club = (await host.call('POST', '/spaces', { name: 'Club' })).body;
    await strata.join(club.id, owner, SpaceRole.VIEWER);
    const keep = await strata.item(owner.personalSpaceId, 'Keep');
    const binned = await strata.item(owner.personalSpaceId, 'Binned');
    const already = await strata.item(owner.personalSpaceId, 'Already gone');
    await strata.prisma.item.update({ where: { id: already.id }, data: { trashedAt: new Date() } });
    const viewOnly = await strata.item(club.id, 'Not mine');
    const hidden = await strata.item(host.personalSpaceId, 'Private');
    const request = { action: 'trash', itemIds: [keep.id, binned.id, already.id, viewOnly.id, hidden.id] };

    expect((await owner.call('POST', '/tidy/apply', { action: 'trash', itemIds: [] })).status).toBe(400);
    const preview = (await owner.call('POST', '/tidy/preview', request)).body;
    expect(ids(preview.changes)).toEqual([keep.id, binned.id]);
    expect(preview.skipped).toEqual([
      { id: already.id, title: 'Already gone', reason: 'Already in the trash' },
      { id: viewOnly.id, title: 'Not mine', reason: 'You can only view this space' },
      { id: hidden.id, title: null, reason: 'Not found' },
    ]);
    expect(await strata.prisma.item.count({ where: { id: { in: [keep.id, binned.id] }, trashedAt: { not: null } } })).toBe(0);

    const applied = (await owner.call('POST', '/tidy/apply', request)).body;
    expect(applied.batch).toMatchObject({ action: 'trash', itemCount: 2, remaining: 2, undoneAt: null });
    expect(applied.skipped).toHaveLength(3);
    expect(await strata.prisma.item.count({ where: { id: { in: [keep.id, binned.id] }, trashedAt: { not: null } } })).toBe(2);
    expect(await strata.prisma.activityEvent.count({ where: { itemId: keep.id, verb: 'item.trashed' } })).toBe(1);
    expect(ids((await owner.call('GET', '/tidy/history')).body)).toEqual([applied.batch.id]);

    await owner.call('POST', `/items/${keep.id}/restore`);
    expect((await host.call('POST', `/tidy/history/${applied.batch.id}/undo`)).status).toBe(404);
    const undone = (await owner.call('POST', `/tidy/history/${applied.batch.id}/undo`)).body;
    expect(undone).toEqual({ restored: 1, skipped: [{ id: keep.id, title: 'Keep', reason: 'No longer in the trash' }] });
    expect(await strata.prisma.item.count({ where: { id: binned.id, trashedAt: null } })).toBe(1);
    expect((await owner.call('POST', `/tidy/history/${applied.batch.id}/undo`)).status).toBe(400);
    expect((await owner.call('GET', '/tidy/history')).body[0].undoneAt).not.toBeNull();
  });

  it('tags only inside the tag’s space and cancels and resumes subscriptions', async () => {
    const owner = await member('tagger');
    const work = (await owner.call('POST', '/spaces', { name: 'Work' })).body;
    const finance = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/tags`, { name: 'Finance' })).body;
    const receipt = await strata.item(owner.personalSpaceId, 'Receipt');
    const elsewhere = await strata.item(work.id, 'Work receipt');
    const stream = await subscription(owner, owner.personalSpaceId, 'Stream', 'streaming');

    expect((await owner.call('POST', '/tidy/preview', { action: 'tag', itemIds: [receipt.id] })).status).toBe(400);
    const tagged = (await owner.call('POST', '/tidy/apply', { action: 'tag', tagId: finance.id, itemIds: [receipt.id, elsewhere.id] })).body;
    expect(tagged.skipped).toEqual([{ id: elsewhere.id, title: 'Work receipt', reason: 'The tag belongs to another space' }]);
    expect(tagged.batch).toMatchObject({ action: 'tag', tag: { name: 'Finance' }, itemCount: 1 });
    expect((await owner.call('GET', `/items/${receipt.id}`)).body.tags.map((tag: { name: string }) => tag.name)).toEqual(['Finance']);
    expect((await owner.call('POST', `/tidy/history/${tagged.batch.id}/undo`)).body.restored).toBe(1);
    expect((await owner.call('GET', `/items/${receipt.id}`)).body.tags).toEqual([]);

    const cancelled = (await owner.call('POST', '/tidy/apply', { action: 'cancel', itemIds: [stream.id, receipt.id] })).body;
    expect(cancelled.skipped).toEqual([{ id: receipt.id, title: 'Receipt', reason: 'Not a subscription' }]);
    expect((await owner.call('GET', `/subscriptions/${stream.id}`)).body.cancelledOn).not.toBeNull();
    expect((await owner.call('POST', `/tidy/history/${cancelled.batch.id}/undo`)).body.restored).toBe(1);
    expect((await owner.call('GET', `/subscriptions/${stream.id}`)).body.cancelledOn).toBeNull();
  });

  it('runs rules on new items as their author and lists existing matches', async () => {
    const owner = await member('ruler');
    const viewer = await member('watcher');
    const home = (await owner.call('POST', '/spaces', { name: 'Home' })).body;
    await strata.join(home.id, viewer, SpaceRole.VIEWER);
    const finance = (await owner.call('POST', `/spaces/${home.id}/tags`, { name: 'Finance' })).body;
    const foreign = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/tags`, { name: 'Elsewhere' })).body;
    const before = await strata.item(home.id, 'March receipt');
    await strata.item(home.id, 'Receipt task', ItemKind.TASK);

    expect((await viewer.call('POST', `/spaces/${home.id}/tidy-rules`, { titleContains: 'receipt', tagId: finance.id })).status).toBe(403);
    expect((await owner.call('POST', `/spaces/${home.id}/tidy-rules`, { titleContains: 'receipt', tagId: foreign.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${home.id}/tidy-rules`, { titleContains: ' ', tagId: finance.id })).status).toBe(400);
    const rule = (await owner.call('POST', `/spaces/${home.id}/tidy-rules`, { titleContains: 'RECEIPT', kind: 'note', tagId: finance.id })).body;
    expect(rule).toMatchObject({ titleContains: 'RECEIPT', kind: 'note', enabled: true, tag: { name: 'Finance' } });
    expect((await viewer.call('GET', `/spaces/${home.id}/tidy-rules`)).body).toHaveLength(1);
    expect((await viewer.call('DELETE', `/tidy-rules/${rule.id}`)).status).toBe(403);

    expect((await viewer.call('GET', `/tidy-rules/${rule.id}/matches`)).body).toMatchObject({ total: 1, results: [{ id: before.id, kind: 'note' }] });

    const after = await strata.item(home.id, 'April receipt');
    await strata.service(TidyRulesService).applyRules(new Date(Date.now() + 2 * 60_000));
    expect(await strata.prisma.itemTag.count({ where: { itemId: after.id, tagId: finance.id } })).toBe(1);
    expect(await strata.prisma.itemTag.count({ where: { itemId: before.id, tagId: finance.id } })).toBe(0);
    const [batch] = (await owner.call('GET', '/tidy/history')).body;
    expect(batch).toMatchObject({ action: 'tag', itemCount: 1, rule: { id: rule.id } });

    expect((await owner.call('PATCH', `/tidy-rules/${rule.id}`, { enabled: false })).body.enabled).toBe(false);
    const paused = await strata.item(home.id, 'May receipt');
    await strata.service(TidyRulesService).applyRules(new Date(Date.now() + 2 * 60_000));
    expect(await strata.prisma.itemTag.count({ where: { itemId: paused.id } })).toBe(0);

    expect((await owner.call('DELETE', `/tidy-rules/${rule.id}`)).status).toBe(204);
    expect((await owner.call('GET', `/tidy-rules/${rule.id}/matches`)).status).toBe(404);
  });

  it('matches rules by file type, with or without words in the title', async () => {
    const owner = await member('filer');
    const papers = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/tags`, { name: 'Papers' })).body;
    const pdf = await file(owner, owner.personalSpaceId, 'lease.pdf', Buffer.from(`%PDF-1.4 lease ${owner.id}`));
    await file(owner, owner.personalSpaceId, 'lease.txt', Buffer.from(`lease ${owner.id}`));
    await strata.item(owner.personalSpaceId, 'lease notes');

    expect((await owner.call('POST', `/spaces/${owner.personalSpaceId}/tidy-rules`, { tagId: papers.id })).status).toBe(400);
    expect((await owner.call('POST', `/spaces/${owner.personalSpaceId}/tidy-rules`, { fileType: 'video', tagId: papers.id })).status).toBe(400);
    const rule = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/tidy-rules`, { fileType: 'pdf', tagId: papers.id })).body;
    expect(rule).toMatchObject({ titleContains: '', fileType: 'pdf', kind: null });
    expect(ids((await owner.call('GET', `/tidy-rules/${rule.id}/matches`)).body.results)).toEqual([pdf.id]);

    const both = (await owner.call('POST', `/spaces/${owner.personalSpaceId}/tidy-rules`, { titleContains: 'invoice', fileType: 'pdf', tagId: papers.id })).body;
    expect((await owner.call('GET', `/tidy-rules/${both.id}/matches`)).body.total).toBe(0);

    const later = await file(owner, owner.personalSpaceId, 'invoice.pdf', Buffer.from(`%PDF-1.4 invoice ${owner.id}`));
    await file(owner, owner.personalSpaceId, 'invoice.txt', Buffer.from(`invoice ${owner.id}`));
    await strata.service(TidyRulesService).applyRules(new Date(Date.now() + 2 * 60_000));
    const tagged = await strata.prisma.itemTag.findMany({ where: { tagId: papers.id }, select: { itemId: true } });
    expect(tagged.map((entry) => entry.itemId)).toEqual([later.id]);
  });

  it('schedules a weekly summary for people who turned it on and sends it only when there is clutter', async () => {
    const keen = await member('weekly');
    const quiet = await member('quiet');
    const tidy = strata.service(TidyService);
    expect((await keen.call('PATCH', '/me', { tidySummary: true, timeZone: 'Europe/London' })).body).toMatchObject({ tidySummary: true });
    expect((await quiet.call('GET', '/me')).body.tidySummary).toBe(false);

    await tidy.scheduleSummaries(new Date('2030-01-05T12:00:00Z'));
    await tidy.scheduleSummaries(new Date('2030-01-05T12:05:00Z'));
    const jobs = await strata.prisma.scheduledJob.findMany({ where: { kind: 'tidy.summary', payload: { path: ['userId'], equals: keen.id } } });
    expect(jobs.map((job) => job.runAt.toISOString())).toEqual(['2030-01-07T09:00:00.000Z']);
    expect(await strata.prisma.scheduledJob.count({ where: { kind: 'tidy.summary', payload: { path: ['userId'], equals: quiet.id } } })).toBe(0);

    await tidy.sendSummary(keen.id);
    expect(await strata.prisma.inboxNotification.count({ where: { userId: keen.id } })).toBe(0);

    const copy = Buffer.from(`weekly ${keen.id}`);
    await file(keen, keen.personalSpaceId, 'a.txt', copy);
    await file(keen, keen.personalSpaceId, 'b.txt', copy);
    await tidy.sendSummary(keen.id);
    const [entry] = await strata.prisma.inboxNotification.findMany({ where: { userId: keen.id } });
    expect(entry).toMatchObject({ kind: 'tidy_summary', title: `Tidy found 1 extra copy (1 KB)`, link: '/tidy' });

    await keen.call('PATCH', '/me', { tidySummary: false });
    await tidy.sendSummary(keen.id);
    expect(await strata.prisma.inboxNotification.count({ where: { userId: keen.id } })).toBe(1);
    await strata.prisma.scheduledJob.deleteMany({ where: { id: { in: jobs.map((job) => job.id) } } });
  });
});
