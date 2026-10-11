export const inboxKinds = [
  'invitation',
  'member_joined',
  'role_changed',
  'removed_from_space',
  'task_assigned',
  'task_due',
  'subscription_due',
  'event_soon',
  'tidy_summary',
  'comment',
  'weekly_review',
] as const;

export type InboxKind = (typeof inboxKinds)[number];

export interface InboxEntry {
  userId: string;
  kind: InboxKind;
  title: string;
  body?: string;
  link?: string;
}
