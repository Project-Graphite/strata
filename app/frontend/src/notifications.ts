import type { IconName } from '@project-graphite/ui';
import { appCatalogue } from './apps';

export type Channel = 'inbox' | 'device' | 'email';

export const channels: { key: Channel; label: string }[] = [
  { key: 'inbox', label: 'In Strata' },
  { key: 'device', label: 'This device' },
  { key: 'email', label: 'Email' },
];

export type ReminderField = 'weeklyReview' | 'tidySummary' | 'journalReminder';

export interface NotificationKind {
  kind: string;
  label: string;
  icon: IconName;
  reminder?: ReminderField;
  emailed?: false;
}

export interface NotificationGroup {
  key: string;
  label: string;
  icon: IconName;
  kinds: NotificationKind[];
}

const appIcon = (key: string) => appCatalogue.find((app) => app.key === key)!.icon;

const group = (key: string, label: string, icon: IconName, kinds: (Omit<NotificationKind, 'icon'> & { icon?: IconName })[]): NotificationGroup => ({
  key,
  label,
  icon,
  kinds: kinds.map((kind) => ({ icon, ...kind })),
});

export const notificationGroups: NotificationGroup[] = [
  group('tasks', 'Tasks', appIcon('tasks'), [
    { kind: 'task_assigned', label: 'Assigned to you' },
    { kind: 'task_due', label: 'Due' },
  ]),
  group('collaboration', 'Collaboration', 'users', [
    { kind: 'comment', label: 'Comments and mentions' },
    { kind: 'watching', label: 'Changes to things you watch' },
  ]),
  group('agenda', 'Agenda', appIcon('agenda'), [
    { kind: 'event_soon', label: 'Events starting soon' },
    { kind: 'event_response', label: 'RSVP and date-poll answers' },
    { kind: 'birthday', label: 'Birthdays', icon: appIcon('people') },
  ]),
  group('spending', 'Spending', appIcon('spending'), [
    { kind: 'subscription_due', label: 'Subscriptions due' },
    { kind: 'payment_due', label: 'Payments due' },
    { kind: 'budget_alert', label: 'Budget alerts' },
    { kind: 'capture_review', label: 'Captured payments waiting for review' },
  ]),
  group('spaces', 'Spaces', 'folder', [
    { kind: 'member_joined', label: 'Someone joined' },
    { kind: 'role_changed', label: 'Your role changed' },
    { kind: 'removed_from_space', label: 'You were removed from a space' },
    { kind: 'invitation', label: 'Invitations', emailed: false },
  ]),
  group('journal', 'Journal', appIcon('journal'), [
    { kind: 'journal_reminder', label: 'Daily journal reminder', reminder: 'journalReminder' },
    { kind: 'weekly_review', label: 'Weekly review', reminder: 'weeklyReview' },
  ]),
  group('tidy', 'Tidy', appIcon('tidy'), [{ kind: 'tidy_summary', label: 'Tidy summaries', reminder: 'tidySummary' }]),
];

export const notificationKinds = notificationGroups.flatMap((shown) => shown.kinds);

export const notificationIcon = (kind: string): IconName => notificationKinds.find((shown) => shown.kind === kind)?.icon ?? 'bell';

export interface ChannelState {
  inboxMuted: string[];
  emailKinds: string[];
  deviceKinds: string[] | null;
  reminders: Record<ReminderField, boolean>;
}

const has = (list: string[] | null, kind: string) => Boolean(list?.includes(kind));

export function channelOn(state: ChannelState, entry: NotificationKind, channel: Channel) {
  if (entry.reminder && !state.reminders[entry.reminder]) return false;
  if (channel === 'inbox') return !state.inboxMuted.includes(entry.kind);
  if (channel === 'email') return entry.emailed !== false && has(state.emailKinds, entry.kind);
  return has(state.deviceKinds, entry.kind);
}

const toggled = (list: string[], kind: string, on: boolean) => (on ? [...new Set([...list, kind])] : list.filter((shown) => shown !== kind));

export function withChannels(state: ChannelState, changes: { entry: NotificationKind; channel: Channel; on: boolean }[]): ChannelState {
  return changes.reduce<ChannelState>((current, { entry, channel, on }) => {
    let next = current;
    if (entry.reminder && !current.reminders[entry.reminder] && on) {
      next = {
        inboxMuted: toggled(next.inboxMuted, entry.kind, true),
        emailKinds: toggled(next.emailKinds, entry.kind, false),
        deviceKinds: next.deviceKinds && toggled(next.deviceKinds, entry.kind, false),
        reminders: { ...next.reminders, [entry.reminder]: true },
      };
    }
    if (channel === 'inbox') next = { ...next, inboxMuted: toggled(next.inboxMuted, entry.kind, !on) };
    if (channel === 'email') next = { ...next, emailKinds: toggled(next.emailKinds, entry.kind, on) };
    if (channel === 'device' && next.deviceKinds) next = { ...next, deviceKinds: toggled(next.deviceKinds, entry.kind, on) };
    if (entry.reminder && next.reminders[entry.reminder] && !channels.some((shown) => channelOn(next, entry, shown.key))) next = { ...next, reminders: { ...next.reminders, [entry.reminder]: false } };
    return next;
  }, state);
}
