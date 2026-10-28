import { useSearchParams } from 'react-router';
import { Pagination, Placeholder, timeAgo } from '@project-graphite/ui';
import { describeActivity, type ActivityEvent } from '../../activity';
import type { Page } from '../../api';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { rowsOf, SkeletonLine, useRememberedShape } from '../../components/Skeletons';

const empty = { title: 'No activity yet', hint: 'What people add, change and finish in this space shows up here.' };

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
