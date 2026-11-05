import { describe, expect, it } from 'vitest';
import { channelOn, notificationIcon, notificationKinds, withChannels, type ChannelState } from '../../frontend/src/notifications';
import { allPushKinds } from '../../frontend/src/push';
import { emailableKinds, inboxKinds } from '../src/inbox/inbox-kinds';
import { pushBrowser } from '../src/inbox/push.service';
import { nextJournalEvening } from '../src/journal/journal-reminder.service';

const entry = (kind: string) => notificationKinds.find((shown) => shown.kind === kind)!;
const quiet: ChannelState = { inboxMuted: [], emailKinds: [], deviceKinds: [], reminders: { weeklyReview: false, tidySummary: false, journalReminder: false } };

describe('notification settings', () => {
  it('offers a row for every kind the server sends, and pushes every kind', () => {
    expect(notificationKinds.map((shown) => shown.kind).sort()).toEqual([...inboxKinds].sort());
    expect([...allPushKinds].sort()).toEqual([...inboxKinds].sort());
    expect(notificationKinds.filter((shown) => shown.emailed !== false).map((shown) => shown.kind).sort()).toEqual([...emailableKinds].sort());
  });

  it('shows each kind with the icon of the feature it comes from', () => {
    expect(notificationIcon('task_due')).toBe('check-mark');
    expect(notificationIcon('budget_alert')).toBe('wallet');
    expect(notificationIcon('birthday')).toBe('users');
    expect(notificationIcon('weekly_review')).toBe('pencil');
    expect(notificationIcon('unknown')).toBe('bell');
  });

  it('keeps a kind in the bell unless it is muted there, and sends email only when chosen', () => {
    const muted = withChannels(quiet, [{ entry: entry('comment'), channel: 'inbox', on: false }]);
    expect(channelOn(muted, entry('comment'), 'inbox')).toBe(false);
    expect(channelOn(quiet, entry('comment'), 'inbox')).toBe(true);
    const emailed = withChannels(muted, [{ entry: entry('comment'), channel: 'email', on: true }]);
    expect(channelOn(emailed, entry('comment'), 'email')).toBe(true);
    expect(channelOn(emailed, entry('invitation'), 'email')).toBe(false);
  });

  it('turns an opt-in reminder on for just the chosen channel and off again with the last one', () => {
    const emailOnly = withChannels(quiet, [{ entry: entry('weekly_review'), channel: 'email', on: true }]);
    expect(emailOnly.reminders.weeklyReview).toBe(true);
    expect(channelOn(emailOnly, entry('weekly_review'), 'email')).toBe(true);
    expect(channelOn(emailOnly, entry('weekly_review'), 'inbox')).toBe(false);
    const off = withChannels(emailOnly, [{ entry: entry('weekly_review'), channel: 'email', on: false }]);
    expect(off.reminders.weeklyReview).toBe(false);
  });

  it('names push devices by browser', () => {
    expect(pushBrowser('https://web.push.apple.com/abc')).toBe('Safari');
    expect(pushBrowser('https://updates.push.services.mozilla.com/abc')).toBe('Firefox');
    expect(pushBrowser('https://fcm.googleapis.com/fcm/send/abc')).toBe('Chrome or Android');
  });

  it('reminds about the journal at 8 in the evening, tomorrow once that has passed', () => {
    expect(nextJournalEvening('UTC', new Date('2026-11-05T10:00:00Z')).toISOString()).toBe('2026-11-05T20:00:00.000Z');
    expect(nextJournalEvening('UTC', new Date('2026-11-05T21:00:00Z')).toISOString()).toBe('2026-11-06T20:00:00.000Z');
  });
});
