export type Link = (path: string) => string;

export interface Email {
  subject: string;
  text: string;
  html: string;
}

interface Action {
  label: string;
  url: string;
}

interface Content {
  subject: string;
  preheader: string;
  greeting: string;
  lines?: string[];
  note?: string;
  prompt?: string;
  actions?: Action[];
  after?: string[];
  items?: { title: string; body?: string | null; url: string }[];
  footer?: Action;
}

const palette = {
  paper: '#0c0c0e',
  surface: '#131316',
  line: '#26262c',
  ink: '#e8e8ea',
  muted: '#8b8b95',
  faint: '#7d7d87',
};

const font = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

const paragraph = (text: string, color = palette.ink) =>
  `<p class="${color === palette.ink ? 'ink' : 'muted'}" style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${color};">${escapeHtml(text)}</p>`;

const button = ({ label, url }: Action) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td class="button" style="border-radius:8px;background:${palette.ink};"><a class="button-text" href="${escapeHtml(url)}" style="display:inline-block;padding:11px 20px;font-size:15px;font-weight:600;color:${palette.paper};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;

const secondary = ({ label, url }: Action) =>
  `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;"><a class="ink" href="${escapeHtml(url)}" style="color:${palette.ink};text-decoration:underline;">${escapeHtml(label)}</a></p>`;

const item = ({ title, body, url }: NonNullable<Content['items']>[number]) =>
  `<tr><td class="rule" style="padding:14px 0;border-top:1px solid ${palette.line};"><a class="ink" href="${escapeHtml(url)}" style="font-size:15px;font-weight:600;line-height:1.4;color:${palette.ink};text-decoration:none;">${escapeHtml(title)}</a>${body ? `<div class="muted" style="margin-top:4px;font-size:13px;line-height:1.5;color:${palette.muted};">${escapeHtml(body)}</div>` : ''}</td></tr>`;

function html(link: Link, content: Content) {
  const [primary, ...others] = content.actions ?? [];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(content.subject)}</title>
<style>
@media (prefers-color-scheme: light) {
  .page { background: #f4f4f5 !important; }
  .card { background: #ffffff !important; border-color: #e4e4e7 !important; }
  .ink, .brand { color: #18181b !important; }
  .muted { color: #5f5f69 !important; }
  .rule { border-color: #e4e4e7 !important; }
  .note { border-color: #d4d4d8 !important; color: #3f3f46 !important; }
  .button { background: #18181b !important; }
  .button-text { color: #ffffff !important; }
}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${palette.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${palette.paper};font-family:${font};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;">
<a href="${escapeHtml(link('/'))}" class="brand" style="color:${palette.ink};text-decoration:none;font-size:17px;font-weight:640;letter-spacing:-0.02em;"><img src="${escapeHtml(link('/icons/icon-192.png'))}" width="28" height="28" alt="" style="vertical-align:middle;border:0;border-radius:6px;margin-right:10px;">Strata</a>
</td></tr>
<tr><td class="card" style="background:${palette.surface};border:1px solid ${palette.line};border-radius:16px;padding:32px 28px;">
${paragraph(content.greeting)}
${(content.lines ?? []).map((line) => paragraph(line)).join('\n')}
${content.note ? `${paragraph('Their note:', palette.muted)}<blockquote class="note" style="margin:0 0 16px;padding:4px 0 4px 14px;border-left:3px solid ${palette.line};font-size:15px;line-height:1.55;color:${palette.ink};white-space:pre-wrap;">${escapeHtml(content.note)}</blockquote>` : ''}
${content.items ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${content.items.map(item).join('')}</table>` : ''}
${content.prompt ? paragraph(content.prompt) : ''}
${primary ? button(primary) : ''}
${others.map(secondary).join('\n')}
${(content.after ?? []).map((line) => paragraph(line, palette.muted)).join('\n')}
</td></tr>
<tr><td class="muted" style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:${palette.faint};">
${content.footer ? `<p style="margin:0 0 8px;"><a class="muted" href="${escapeHtml(content.footer.url)}" style="color:${palette.faint};text-decoration:underline;">${escapeHtml(content.footer.label)}</a></p>` : ''}
<p style="margin:0;">Strata, from Project Graphite</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function text(content: Content) {
  return [
    content.greeting,
    ...(content.lines ?? []),
    ...(content.note ? ['Their note:', content.note] : []),
    ...(content.items ?? []).map(({ title, body, url }) => [title, body, url].filter(Boolean).join('\n')),
    ...(content.prompt ? [content.prompt] : []),
    ...(content.actions?.length ? [content.actions.map(({ url }) => url).join('\n')] : []),
    ...(content.after ?? []),
    ...(content.footer ? [`${content.footer.label}: ${content.footer.url}`] : []),
  ].join('\n\n');
}

const compose = (link: Link, content: Content): Email => ({ subject: content.subject, text: text(content), html: html(link, content) });

const hi = (name?: string) => (name ? `Hi ${name},` : 'Hi,');

const resetPassword = (link: Link): Action => ({ label: 'Reset your password', url: link('/forgot-password') });
const securityLog = (link: Link): Action => ({ label: 'Open your security log', url: link('/settings/security') });

export const existingAccountEmail = (link: Link, { name }: { name: string }) =>
  compose(link, {
    subject: 'Someone tried to create a Strata account with your email',
    preheader: 'Nothing was changed on your account.',
    greeting: hi(name),
    lines: ['Someone tried to create a new Strata account with this email address, which already has one. Nothing was changed.'],
    prompt: 'If it was you, sign in instead, or reset your password if you have forgotten it:',
    actions: [resetPassword(link)],
  });

export const emailChangeSubject = 'Changing your Strata email';

export const verifyEmail = (link: Link, { name, token, changing }: { name: string; token: string; changing: boolean }) =>
  compose(link, {
    subject: changing ? emailChangeSubject : 'Verify your Strata email',
    preheader: 'The link works for 24 hours.',
    greeting: hi(name),
    prompt: changing ? 'Confirm this address to use it for your Strata account:' : 'Confirm this address to finish creating your Strata account:',
    actions: [{ label: changing ? 'Confirm new email' : 'Verify email', url: link(`/verify?token=${token}`) }],
    after: ['The link works for 24 hours. If you did not ask for this, ignore this email.'],
  });

export const passwordResetEmail = (link: Link, { name, token }: { name: string; token: string }) =>
  compose(link, {
    subject: 'Reset your Strata password',
    preheader: 'Choose a new password within the next hour.',
    greeting: hi(name),
    prompt: 'Someone asked to reset the password of your Strata account. Choose a new one with this link within the next hour:',
    actions: [{ label: 'Choose a new password', url: link(`/reset-password?token=${token}`) }],
    after: ['If that was not you, ignore this email and your password stays the same.'],
  });

export const passwordChangedEmail = (link: Link, { name }: { name: string }) =>
  compose(link, {
    subject: 'Your Strata password was changed',
    preheader: 'Every device was signed out.',
    greeting: hi(name),
    lines: ['The password of your Strata account was just changed. Every device was signed out and your access tokens were revoked.'],
    prompt: 'If this was not you, reset it again now:',
    actions: [resetPassword(link)],
  });

export const emailChangeRequestedEmail = (link: Link, { name }: { name: string }) =>
  compose(link, {
    subject: emailChangeSubject,
    preheader: 'Nothing changes until the new address is confirmed.',
    greeting: hi(name),
    lines: ['Your Strata account is moving to a new email address. We sent a link there to confirm it, and nothing changes until it is confirmed.'],
    prompt: 'If you did not ask for this, reset your password now. That cancels the change:',
    actions: [resetPassword(link)],
  });

export const sessionReusedEmail = (link: Link, { name, device, at }: { name: string; device: string; at: Date }) =>
  compose(link, {
    subject: 'Someone may have your session',
    preheader: 'Every device was signed out.',
    greeting: hi(name),
    lines: [`A sign-in to your Strata account on ${device} was used again after it had already been renewed, at ${at.toUTCString()}. That usually means someone else has a copy of it, so every device was signed out.`],
    prompt: 'If you do not recognise this, reset your password now and check your security log:',
    actions: [resetPassword(link), securityLog(link)],
  });

export const newDeviceEmail = (link: Link, { name, device, at }: { name: string; device: string; at: Date }) =>
  compose(link, {
    subject: 'New sign-in to your Strata account',
    preheader: `Signed in from ${device}.`,
    greeting: hi(name),
    lines: [`Your Strata account was just signed in to from a new device: ${device}, at ${at.toUTCString()}.`],
    prompt: 'If this was you, there is nothing to do. If not, reset your password now, then sign out the devices you do not recognise:',
    actions: [resetPassword(link), securityLog(link)],
  });

export const twoStepEmail = (link: Link, { name, on }: { name: string; on: boolean }) =>
  compose(link, {
    subject: on ? 'Two-step sign-in is on for your Strata account' : 'Two-step sign-in is off for your Strata account',
    preheader: on ? 'Signing in now also needs a code.' : 'Signing in now needs only your password.',
    greeting: hi(name),
    lines: [on ? 'Signing in to Strata now also needs a code from your authenticator app or one of your recovery codes.' : 'Signing in to Strata now needs only your password.'],
    prompt: 'If this was not you, reset your password now and sign out your other devices:',
    actions: [resetPassword(link)],
  });

export const eventInviteEmail = (link: Link, { name, title, when, token }: { name: string; title: string; when: string; token: string }) =>
  compose(link, {
    subject: 'You are invited to an event',
    preheader: `${title}, ${when}.`,
    greeting: hi(name),
    lines: [`You are invited to "${title}" on ${when}.`],
    prompt: 'Say whether you can come, with no account needed:',
    actions: [{ label: 'Reply to the invite', url: link(`/rsvp/${token}`) }],
  });

export const strataInviteEmail = (link: Link, { inviter, note, token }: { inviter: string; note?: string; token: string }) =>
  compose(link, {
    subject: 'You are invited to Strata',
    preheader: `${inviter} invited you to Strata.`,
    greeting: hi(),
    lines: [`${inviter} invited you to Strata, a private workspace for your notes, agenda, subscriptions and files.`],
    note,
    prompt: 'Create your account with this link within 14 days:',
    actions: [{ label: 'Create your account', url: link(`/invite/${token}`) }],
    after: ['If you already have a Strata account, sign in instead. If you did not expect this, ignore this email.'],
  });

export const spaceInviteEmail = (
  link: Link,
  { name, inviter, space, role, note, token }: { name?: string; inviter: string; space: string; role: string; note?: string; token?: string },
) =>
  compose(link, {
    subject: 'You are invited to a space on Strata',
    preheader: `${inviter} invited you to ${space}.`,
    greeting: hi(name),
    lines: [`${inviter} invited you to join the space "${space}" on Strata as ${role === 'viewer' ? 'a viewer' : `an ${role}`}.`],
    note,
    prompt: token ? 'Join within 14 days with this link:' : 'Accept or decline it from your invitations:',
    actions: [token ? { label: 'Join the space', url: link(`/invite/${token}`) } : { label: 'Open your invitations', url: link('/spaces/invitations') }],
    after: ['If you did not expect this, ignore this email.'],
  });

export const notificationsEmail = (link: Link, { name, entries }: { name: string; entries: { title: string; body?: string | null; link?: string | null }[] }) =>
  compose(link, {
    subject: entries.length === 1 ? entries[0]!.title : `${entries.length} new notifications on Strata`,
    preheader: entries.length === 1 ? 'A new notification is waiting in your inbox.' : entries.map((entry) => entry.title).slice(0, 3).join(' · '),
    greeting: hi(name),
    lines: [entries.length === 1 ? 'There is a new notification in your Strata inbox:' : `There are ${entries.length} new notifications in your Strata inbox:`],
    items: entries.map((entry) => ({ title: entry.title, body: entry.body, url: link(entry.link ?? '/inbox') })),
    actions: [{ label: 'Open your inbox', url: link('/inbox') }],
    footer: { label: 'Choose which notifications reach your email', url: link('/settings/notifications') },
  });
