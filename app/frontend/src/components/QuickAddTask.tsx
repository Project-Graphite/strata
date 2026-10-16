import { useId, useState } from 'react';
import { useAuth } from '../auth';
import { describeQuickTask, parseQuickTask } from '../quick-add';
import type { Tag } from '../spaces';
import type { Task } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button } from './Button';

export function QuickAddTask({ listId, onAdded, spaceId }: { listId?: string; onAdded: (task: Task) => void; spaceId: string }) {
  const auth = useAuth();
  const adding = useAction();
  const hintId = useId();
  const tags = useResource<Tag[]>(`/spaces/${spaceId}/tags`, true);
  const [text, setText] = useState('');
  const quick = parseQuickTask(text, (tags.data ?? []).map((tag) => tag.name));
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
          const tagIds = (tags.data ?? []).filter((tag) => quick.tagNames.includes(tag.name)).map((tag) => tag.id);
          if (tagIds.length) await auth.request(`/items/${added.id}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds }) });
          setText('');
          onAdded(added);
          return `Added ${added.title}.`;
        }, 'Could not add the task');
      }}
    >
      <div className="flex gap-2">
        <input
          aria-describedby={understood ? hintId : undefined}
          aria-label="Add a task"
          className="min-w-0 flex-1"
          maxLength={300}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder="Add a task"
          value={text}
        />
        <Button disabled={!quick.title || adding.busy} label="Add" submit />
      </div>
      {understood && (
        <p className="mono-sm m-0 text-faint" id={hintId} role="status">
          Understood: {understood}
        </p>
      )}
    </form>
  );
}
