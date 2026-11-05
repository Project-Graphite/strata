import { Page } from '../components/Page';
import { TaskWorkspace } from '../components/TaskWorkspace';
import { useAllSpaces } from '../spaces';

export function TasksPage() {
  const spaces = useAllSpaces();
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