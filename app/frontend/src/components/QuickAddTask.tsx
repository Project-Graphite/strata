import { useId, useState } from 'react';
import { useAuth } from '../auth';
import { describeQuickTask, parseQuickTask } from '../quick-add';
import type { Task } from '../tasks';
import { useAction } from '../useAction';

export function QuickAddTask({ listId, onAdded, spaceId }: { listId?: string; onAdded: (task: Task) => void; spaceId: string }) {
  const auth = useAuth();
  const adding = useAction();
  const hintId = useId();
  const [text, setText] = useState('');
  const quick = parseQuickTask(text, []);
  const understood = describeQuickTask(quick);

  return (
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!quick.title) return;
        void adding.run(async () => {
          const added = await auth.request<Task>(`/spaces/${spaceId}/tasks`, {
            method: 'POST',
            body: JSON.stringify({ title: quick.title.slice(0, 200), listId, dueDate: quick.dueDate, dueTime: quick.dueTime, priority: quick.priority }),
          });
          setText('');
          onAdded(added);
          return '';
        }, 'Could not add the to-do');
      }}
    >
      <div className="flex gap-2">
        <input
          aria-describedby={understood ? hintId : undefined}
          aria-label="Add a to-do"
          className="min-w-0 flex-1"
          maxLength={300}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder="Add a to-do"
          value={text}
        />
        <button className="secondary-button shrink-0 px-3 py-1.5 text-sm" disabled={!quick.title || adding.busy} type="submit">
          Add
        </button>
      </div>
      {understood && (
        <p className="mono-sm m-0 text-faint" id={hintId} role="status">
          Understood: {understood}
        </p>
      )}
    </form>
  );
}
