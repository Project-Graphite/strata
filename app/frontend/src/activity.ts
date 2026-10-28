import { formatDay } from '@project-graphite/ui';

export interface ActivityEvent {
  id: string;
  verb: string;
  actor: { handle: string; displayName: string } | null;
  item: { id: string; kind: string; title: string } | null;
  data: Record<string, string | boolean | undefined>;
  createdAt: string;
}

const withArticle = (role?: string | boolean) => (role === 'viewer' ? 'a viewer' : `an ${String(role)}`);

export function describeActivity(event: ActivityEvent) {
  const who = event.actor?.displayName ?? 'Someone';
  const { data } = event;
  const title = `“${String(data.title || 'Untitled')}”`;
  switch (event.verb) {
    case 'space.updated':
      return data.name ? `${who} renamed the space to “${String(data.name)}”` : `${who} changed the space colour`;
    case 'member.joined':
      return `${String(data.member)} joined as ${withArticle(data.role)}`;
    case 'member.left':
      return `${String(data.member)} left the space`;
    case 'member.removed':
      return `${who} removed ${String(data.member)}`;
    case 'member.role_changed':
      return `${who} made ${String(data.member)} ${withArticle(data.role)}`;
    case 'item.created':
      return `${who} added ${title}`;
    case 'item.updated':
      if (data.renamedFrom !== undefined) return `${who} renamed “${String(data.renamedFrom || 'Untitled')}” to ${title}`;
      if (data.status === 'in_progress' || data.status === 'open') return `${who} marked ${title} ${data.status === 'open' ? 'open' : 'in progress'}`;
      if (data.archived !== undefined) return `${who} ${data.archived ? 'archived' : 'unarchived'} ${title}`;
      return `${who} updated ${title}`;
    case 'item.trashed':
      return `${who} moved ${title} to the trash`;
    case 'item.restored':
      return `${who} restored ${title}`;
    case 'item.deleted':
      return `${who} deleted ${title} for good`;
    case 'task.completed':
      return data.nextDue ? `${who} finished ${title}, next due ${formatDay(String(data.nextDue), { day: 'numeric', month: 'short', year: 'numeric' })}` : `${who} finished ${title}`;
    case 'task.reopened':
      return `${who} reopened ${title}`;
    case 'subscription.renewed':
      return `${title} renewed, next on ${formatDay(String(data.nextRenewal), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    case 'subscription.cancelled':
      return event.actor ? `${who} marked ${title} cancelled` : `${title} ended`;
    case 'subscription.resumed':
      return `${who} resumed ${title}`;
    case 'tag.created':
      return `${who} added the tag “${String(data.name)}”`;
    case 'tag.updated':
      return data.name ? `${who} changed the tag “${String(data.name)}”` : `${who} changed a tag colour`;
    case 'tag.deleted':
      return `${who} deleted the tag “${String(data.name)}”`;
    default:
      return `${who} made a change`;
  }
}
