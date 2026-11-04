import { describe, expect, it } from 'vitest';
import {
  emailChangeRequestedEmail,
  escapeHtml,
  eventInviteEmail,
  existingAccountEmail,
  newDeviceEmail,
  notificationsEmail,
  passwordChangedEmail,
  passwordResetEmail,
  sessionReusedEmail,
  spaceInviteEmail,
  strataInviteEmail,
  twoStepEmail,
  verifyEmail,
  type Email,
} from '../src/mail/templates';

const link = (path: string) => new URL(path, 'https://strata.example').toString();
const at = new Date('2026-11-05T09:30:00Z');

const templates: [string, Email, string][] = [
  ['existing account', existingAccountEmail(link, { name: 'Sam' }), 'https://strata.example/forgot-password'],
  ['verify', verifyEmail(link, { name: 'Sam', token: 'abc', changing: false }), 'https://strata.example/verify?token=abc'],
  ['confirm new email', verifyEmail(link, { name: 'Sam', token: 'abc', changing: true }), 'https://strata.example/verify?token=abc'],
  ['password reset', passwordResetEmail(link, { name: 'Sam', token: 'abc' }), 'https://strata.example/reset-password?token=abc'],
  ['password changed', passwordChangedEmail(link, { name: 'Sam' }), 'https://strata.example/forgot-password'],
  ['email change', emailChangeRequestedEmail(link, { name: 'Sam' }), 'https://strata.example/forgot-password'],
  ['session reused', sessionReusedEmail(link, { name: 'Sam', device: 'Firefox on Linux', at }), 'https://strata.example/settings/security'],
  ['new device', newDeviceEmail(link, { name: 'Sam', device: 'Firefox on Linux', at }), 'https://strata.example/settings/security'],
  ['two-step on', twoStepEmail(link, { name: 'Sam', on: true }), 'https://strata.example/forgot-password'],
  ['two-step off', twoStepEmail(link, { name: 'Sam', on: false }), 'https://strata.example/forgot-password'],
  ['event invite', eventInviteEmail(link, { name: 'Sam', title: 'Dinner', when: 'Friday 6 November', token: 'abc' }), 'https://strata.example/rsvp/abc'],
  ['strata invite', strataInviteEmail(link, { inviter: 'Ana', note: 'Join us', token: 'abc' }), 'https://strata.example/invite/abc'],
  ['space invite by email', spaceInviteEmail(link, { inviter: 'Ana', space: 'Home', role: 'editor', token: 'abc' }), 'https://strata.example/invite/abc'],
  ['space invite by handle', spaceInviteEmail(link, { name: 'Sam', inviter: 'Ana', space: 'Home', role: 'viewer' }), 'https://strata.example/spaces/invitations'],
  ['notifications', notificationsEmail(link, { name: 'Sam', entries: [{ title: 'Ana assigned you a task', body: 'Buy bread', link: '/tasks?task=1' }] }), 'https://strata.example/tasks?task=1'],
];

describe('Strata emails', () => {
  it.each(templates)('renders the %s email as themed HTML and plain text with its link', (_name, email, url) => {
    expect(email.subject).not.toBe('');
    expect(email.text).toContain(url);
    expect(email.html).toContain(`href="${escapeHtml(url)}"`);
    expect(email.html).toContain('https://strata.example/icons/icon-192.png');
    expect(email.html).toContain('#131316');
    expect(email.html).toContain('prefers-color-scheme: light');
  });

  it('keeps the plain text of an email as it was before HTML', () => {
    expect(passwordResetEmail(link, { name: 'Sam', token: 'abc' }).text).toBe(
      [
        'Hi Sam,',
        '',
        'Someone asked to reset the password of your Strata account. Choose a new one with this link within the next hour:',
        '',
        'https://strata.example/reset-password?token=abc',
        '',
        'If that was not you, ignore this email and your password stays the same.',
      ].join('\n'),
    );
    expect(sessionReusedEmail(link, { name: 'Sam', device: 'Firefox', at }).text).toContain('https://strata.example/forgot-password\nhttps://strata.example/settings/security');
    expect(strataInviteEmail(link, { inviter: 'Ana', note: 'Join us', token: 'abc' }).text).toContain('files.\n\nTheir note:\n\nJoin us\n\nCreate your account');
  });

  it('escapes what people type into the HTML part', () => {
    const email = spaceInviteEmail(link, { name: '<b>Sam</b>', inviter: 'Ana & "Co"', space: '<script>x</script>', role: 'editor', note: "it's <i>ours</i>", token: 'abc' });
    expect(email.html).not.toMatch(/<script>|<b>Sam|<i>ours/);
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(email.html).toContain('Ana &amp; &quot;Co&quot;');
    expect(email.html).toContain('it&#39;s &lt;i&gt;ours&lt;/i&gt;');
    expect(email.text).toContain('<script>x</script>');
  });

  it('lists every notification in one email and links to the notification settings', () => {
    const email = notificationsEmail(link, { name: 'Sam', entries: [{ title: 'One' }, { title: 'Two', body: 'Details' }, { title: 'Three', link: '/pages/p' }] });
    expect(email.subject).toBe('3 new notifications on Strata');
    expect(email.text).toContain('One\nhttps://strata.example/inbox');
    expect(email.text).toContain('Two\nDetails\nhttps://strata.example/inbox');
    expect(email.text).toContain('Three\nhttps://strata.example/pages/p');
    expect(email.html).toContain('https://strata.example/settings/notifications');
    expect(notificationsEmail(link, { name: 'Sam', entries: [{ title: 'Only one' }] }).subject).toBe('Only one');
  });
});
