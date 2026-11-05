import { Navigate, useSearchParams } from 'react-router';
import { Page } from '../components/Page';
import { TaskWorkspace } from '../components/TaskWorkspace';
import { findSpace, spaceHref, useAllSpaces } from '../spaces';
import type { TaskDetail } from '../tasks';
import { useResource } from '../useResource';

export function TasksPage() {
  const spaces = useAllSpaces();
  const [params] = useSearchParams();
  const linkedId = params.get('task');
  const linked = useResource<TaskDetail>(linkedId ? `/tasks/${linkedId}` : null, true);
  const home = linked.data?.spaceId ? findSpace(spaces.data, linked.data.spaceId) : undefined;
  if (home) return <Navigate replace to={`${spaceHref(home, 'tasks')}?${params.toString()}`} />;
  return (
    <Page title="Tasks">
      <TaskWorkspace
        base="/tasks"
        defaultAssignee={(listId) => (listId ? 'Anyone' : 'Me or unassigned')}
        editable
        editableTask={(task) => spaces.data?.find((space) => space.id === task.spaceId)?.role !== 'viewer'}
        failed={spaces.error ? spaces : undefined}
        linked
        listsPath="/me/lists"
        ready={Boolean(spaces.data)}
        shape="tasks"
        spaceId={null}
        tasksPath="/me/tasks"
      />
    </Page>
  );
}
