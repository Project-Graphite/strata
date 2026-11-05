import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react';
import type { TaskComposer, TaskDraft } from '../task-draft';
import type { Task } from '../tasks';
import { NewTask } from './NewTask';

const TaskSheet = lazy(() => import('./TaskSheet'));

export interface OpenTaskProps {
  composer?: Exclude<TaskComposer, 'condensed'>;
  draft?: TaskDraft;
  listId?: string | null;
  onChanged: (task?: Task) => void;
  onChoose?: (composer: TaskComposer) => void;
  onClose: () => void;
  onCreated?: (task: Task) => void;
  onDraft?: Dispatch<SetStateAction<TaskDraft>>;
  spaceId?: string | null;
  status?: Task['status'];
  task?: Task;
  taskId?: string;
}

export function OpenTask(props: OpenTaskProps) {
  if (!props.task && !props.taskId) return <NewTask {...props} />;
  return (
    <Suspense fallback={null}>
      <TaskSheet {...props} />
    </Suspense>
  );
}