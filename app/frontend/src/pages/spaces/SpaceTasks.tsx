import { TaskWorkspace } from '../../components/TaskWorkspace';
import { spaceHref } from '../../spaces';
import { useSpace, useSpaceMenu } from './SpaceLayout';

export function SpaceTasks() {
  const space = useSpace();
  const editable = space.role !== 'viewer';
  return (
    <TaskWorkspace
      base={spaceHref(space, 'tasks')}
      defaultAssignee={() => 'Anyone'}
      editable={editable}
      editableTask={() => editable}
      linked
      listsPath={`/spaces/${space.id}/lists`}
      menuInto={useSpaceMenu()}
      ready
      shape={`space-tasks-${space.id}`}
      spaceId={space.id}
      spaceView={space.defaults?.task.view}
      tasksPath={`/spaces/${space.id}/tasks`}
    />
  );
}