import { useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton, Pagination, timeAgo } from '@project-graphite/ui';
import type { Page } from '../../api';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

interface ActivityEvent {
  id: string;
  verb: string;
  actor: { handle: string; displayName: string } | null;
  item: { id: string; kind: string; title: string } | null;
  data: Record<string, string | boolean | undefined>;
  createdAt: string;
}

const withArticle = (role?: string | boolean) => (role === 'viewer' ? 'a viewer' : `an ${String(role)}`);

function describeActivity(event: ActivityEvent) {
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
      if (data.archived !== undefined) return `${who} ${data.archived ? 'archived' : 'unarchived'} ${title}`;
      return `${who} updated ${title}`;
    case 'item.trashed':
      return `${who} moved ${title} to the trash`;
    case 'item.restored':
      return `${who} restored ${title}`;
    case 'item.deleted':
      return `${who} deleted ${title} for good`;
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

export function SpaceActivity() {
  const space = useSpace();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const activity = useResource<Page<ActivityEvent>>(`/spaces/${space.id}/activity?page=${page}`, true);

  if (activity.error) return <p className="error-message">{activity.error}</p>;
  if (!activity.data) return <ListSkeleton label="Loading what happened in this space" rows={5} />;
  if (activity.data.results.length === 0) {
    return (
      <EmptyState title="Nothing has happened yet">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">Changes people make in this space are listed here.</p>
      </EmptyState>
    );
  }

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      <ol className="m-0 grid list-none gap-0 p-0">
        {activity.data.results.map((event) => (
          <li className="flex items-baseline justify-between gap-4 border-b border-line-soft py-3" key={event.id}>
            <span className="min-w-0 text-ink">{describeActivity(event)}</span>
            <span className="mono-sm shrink-0 text-faint">{timeAgo(event.createdAt)}</span>
          </li>
        ))}
      </ol>
      <Pagination
        page={activity.data.page}
        pageHref={(next) => `/spaces/${space.id}/activity?page=${next}`}
        totalPages={activity.data.totalPages}
      />
    </div>
  );
}
