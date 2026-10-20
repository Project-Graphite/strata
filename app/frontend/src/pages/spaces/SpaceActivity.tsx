import { useSearchParams } from 'react-router';
import { formatDay, Pagination, Placeholder, timeAgo } from '@project-graphite/ui';
import type { Page } from '../../api';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { rowsOf, SkeletonLine, useRememberedShape } from '../../components/Skeletons';

const empty = { title: 'No activity yet', hint: 'What people add, change and finish in this space shows up here.' };

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

export function SpaceActivity() {
  const space = useSpace();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const activity = useResource<Page<ActivityEvent>>(`/spaces/${space.id}/activity?page=${page}`, true);
  const [rows] = useRememberedShape(`space-activity-${space.id}`, activity.data && [activity.data.results.length], [5]);

  if (activity.error) return <LoadError error={activity.error} onRetry={activity.reload} />;
  if (!activity.data) {
    return (
      <Placeholder label="Loading what happened in this space">
        {rows ? (
          <ol aria-hidden="true" className="panel-rows">
            {rowsOf(rows).map((row) => (
              <li className="flex items-center justify-between gap-4 panel-row" key={row}>
                <SkeletonLine className="min-w-0 flex-1" width={row % 2 ? 'w-1/2' : 'w-2/3'} />
                <SkeletonLine className="mono-sm shrink-0" width="w-14" />
              </li>
            ))}
          </ol>
        ) : (
          <Empty loading title={empty.title}>
            {empty.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }
  if (activity.data.results.length === 0) return <Empty title={empty.title}>{empty.hint}</Empty>;

  return (
    <>
      <ol className="panel-rows">
        {activity.data.results.map((event) => (
          <li className="flex items-baseline justify-between gap-4 panel-row" key={event.id}>
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
    </>
  );
}
