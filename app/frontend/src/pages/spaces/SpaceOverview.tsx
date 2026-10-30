import { Avatar, ListRow, Placeholder } from '@project-graphite/ui';
import type { Page as ResultPage } from '../../api';
import { ButtonLink } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { NoteMark } from '../../components/NoteMark';
import { Section } from '../../components/Page';
import { AvatarSkeleton, IconSkeleton, RowsSkeleton, TaskRowsSkeleton } from '../../components/Skeletons';
import { noteHref, noteTitle, type Note } from '../../notes';
import { roleOptions, type SpaceRole } from '../../spaces';
import { taskDetails, type Task } from '../../tasks';
import { capitalised, formatMoment } from '../../time';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

const shownRows = 5;

export function SpaceOverview() {
  const space = useSpace();
  const base = `/spaces/${space.id}`;
  const notes = useResource<Note[]>(`${base}/notes`, true, { live: ['page-details', 'pages', 'items'], spaceId: space.id });
  const tasks = useResource<ResultPage<Task>>(`${base}/tasks?page=1`, true, { live: ['tasks', 'items'], spaceId: space.id });
  const members = useResource<{ userId: string; displayName: string; role: SpaceRole }[]>(space.kind === 'shared' ? `${base}/members` : null, true);
  const recent = notes.data
    ?.filter((note) => !note.template)
    .toSorted((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, shownRows);
  const open = tasks.data?.results.slice(0, shownRows);

  return (
    <>
      <Section action={<ButtonLink label="Show all" to={`${base}/pages`} />} title="Recent pages">
        {notes.error ? (
          <LoadError compact error={notes.error} onRetry={notes.reload} />
        ) : !recent ? (
          <Placeholder label="Loading recent pages">
            <RowsSkeleton lead={<IconSkeleton />} rows={3} />
          </Placeholder>
        ) : recent.length === 0 ? (
          <Empty title="No pages yet">Pages and boards you add to this space show up here.</Empty>
        ) : (
          <ul className="panel-rows">
            {recent.map((note) => (
              <ListRow
                href={noteHref(note)}
                key={note.id}
                lead={<NoteMark note={note} />}
                meta={capitalised([note.kind === 'board' && 'Board', `edited ${formatMoment(note.updatedAt)}`].filter(Boolean).join(' · '))}
                title={noteTitle(note)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section action={<ButtonLink label="Show all" to={`${base}/tasks`} />} title="Open tasks">
        {tasks.error ? (
          <LoadError compact error={tasks.error} onRetry={tasks.reload} />
        ) : !open ? (
          <Placeholder label="Loading open tasks">
            <TaskRowsSkeleton rows={3} />
          </Placeholder>
        ) : open.length === 0 ? (
          <Empty title="No open tasks">Tasks you add to this space show up here until they are done.</Empty>
        ) : (
          <ul className="panel-rows">
            {open.map((task) => (
              <ListRow href={`/tasks?task=${task.id}`} key={task.id} meta={taskDetails(task).join(' · ')} title={task.title} />
            ))}
          </ul>
        )}
      </Section>

      {space.kind === 'shared' && (
        <Section action={<ButtonLink label="Show all" to={`${base}/members`} />} title="Members">
          {members.error ? (
            <LoadError compact error={members.error} onRetry={members.reload} />
          ) : !members.data ? (
            <Placeholder label="Loading the members">
              <RowsSkeleton detail lead={<AvatarSkeleton />} rows={2} />
            </Placeholder>
          ) : (
            <ul className="panel-rows">
              {members.data.slice(0, shownRows).map((member) => (
                <ListRow
                  key={member.userId}
                  lead={<Avatar name={member.displayName} />}
                  meta={roleOptions.find((option) => option.value === member.role)?.label}
                  title={member.displayName}
                />
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
