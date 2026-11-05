import { SpaceRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { integrationApp } from './harness';

describe('Notification channels against Postgres', () => {
  const strata = integrationApp();
  const { member } = strata;

  it('keeps a muted kind out of the bell while still recording it for email', async () => {
    const owner = await member('muting-owner');
    const editor = await member('muting-editor');
    const space = (await owner.call('POST', '/spaces', { name: 'Quiet' })).body;
    await strata.join(space.id, editor, SpaceRole.EDITOR);
    const page = (await owner.call('POST', `/spaces/${space.id}/notes`, { title: 'Notes' })).body;

    expect((await owner.call('PATCH', '/me', { inboxMuted: ['comment'], emailKinds: ['comment'] })).body).toMatchObject({ inboxMuted: ['comment'], emailKinds: ['comment'] });
    expect((await owner.call('PATCH', '/me', { inboxMuted: ['nonsense'] })).status).toBe(400);
    expect((await editor.call('POST', `/notes/${page.id}/comments`, { body: 'Looks good' })).status).toBe(201);

    expect((await owner.call('GET', '/me/inbox?page=1')).body.results.filter((entry: { kind: string }) => entry.kind === 'comment')).toEqual([]);
    expect((await owner.call('GET', '/me/inbox/summary')).body.unread).toBe(0);
    expect(await strata.prisma.inboxNotification.count({ where: { userId: owner.id, kind: 'comment', shown: false } })).toBe(1);
  });

  it('lets people opt in to a daily journal reminder', async () => {
    const writer = await member('journal-writer');
    expect((await writer.call('GET', '/me')).body.journalReminder).toBe(false);
    expect((await writer.call('PATCH', '/me', { journalReminder: true })).body.journalReminder).toBe(true);
  });
});
