import { useSearchParams } from 'react-router';
import { ListRow, Pagination, Placeholder } from '@project-graphite/ui';
import { describeActivity, type ActivityEvent } from '../../activity';
import type { Page } from '../../api';
import { capitalised, formatMoment } from '../../time';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { RowsSkeleton, useRememberedShape } from '../../components/Skeletons';

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
          <RowsSkeleton rows={rows} />
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
          <ListRow key={event.id} meta={capitalised(formatMoment(event.createdAt))} title={describeActivity(event)} />
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
