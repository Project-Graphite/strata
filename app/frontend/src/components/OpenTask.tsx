import { lazy, Suspense } from 'react';
import type { Task } from '../tasks';

const TaskSheet = lazy(() => import('./TaskSheet'));

export interface OpenTaskProps {
  listId?: string | null;
  onChanged: (task?: Task) => void;
  onClose: () => void;
  onCreated?: (task: Task) => void;
  spaceId?: string;
  task?: Task;
  taskId?: string;
}

export function OpenTask(props: OpenTaskProps) {
  return (
    <Suspense fallback={null}>
      <TaskSheet {...props} />
    </Suspense>
  );
}
