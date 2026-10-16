import { useState } from 'react';
import { DatePicker, Dialog, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { describeQuickTask, parseQuickTask } from '../quick-add';
import type { Tag } from '../spaces';
import { reminderOptions, repeatOptions, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors } from '../validation';
import { TimeField, zoneLabel } from '../time';
import { Button } from './Button';
import { DialogActions } from './DialogActions';

interface Member {
  userId: string;
  displayName: string;
}

const priorities = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Low' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'High' },
];

export function TaskEditor({
  defaultListId,
  editable,
  lists,
  members,
  onClose,
  onSaved,
  onRestored,
  onTrashed,
  spaceId,
  tags = [],
  task,
}: {
  defaultListId?: string | null;
  editable: boolean;
  lists: TaskList[];
  members: Member[];
  onClose: () => void;
  onSaved: (task: Task) => void;
  onRestored?: () => void;
  onTrashed?: () => void;
  spaceId: string;
  tags?: Tag[];
  task?: Task;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const [title, setTitle] = useState(task?.title ?? '');
  const quick = task ? undefined : parseQuickTask(title, tags.map((tag) => tag.name));
  const understood = quick && describeQuickTask(quick);
  const text = (values: FormData, name: string) => String(values.get(name) ?? '').trim();
  const zone = zoneLabel(task?.timeZone ?? auth.user?.timeZone ?? 'UTC');

  return (
    <Dialog onClose={onClose} title={task ? (editable ? 'Edit task' : task.title) : 'New task'}>
      <form
        className="mt-5 grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          if (!form.check(target, { title: [required('Give the task a title.'), atMost(200, 'Use at most 200 characters.')] })) return;
          const values = new FormData(target);
          const reminder = text(values, 'reminderMinutes');
          const dueDate = text(values, 'dueDate') || quick?.dueDate || '';
          const fields = {
            title: quick?.title || text(values, 'title'),
            listId: text(values, 'listId') || null,
            dueDate: dueDate || null,
            dueTime: dueDate ? text(values, 'dueTime') || quick?.dueTime || null : null,
            repeatRule: text(values, 'repeatRule') || null,
            reminderMinutes: reminder ? Number(reminder) : null,
            assigneeId: text(values, 'assigneeId') || null,
            priority: Number(text(values, 'priority')) || quick?.priority || 0,
          };
          void saving
            .run(async () => {
              const saved = await auth.request<Task>(task ? `/tasks/${task.id}` : `/spaces/${spaceId}/tasks`, {
                method: task ? 'PATCH' : 'POST',
                body: JSON.stringify(task ? fields : Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== 0))),
              });
              const tagIds = tags.filter((tag) => quick?.tagNames.includes(tag.name)).map((tag) => tag.id);
              if (tagIds.length) await auth.request(`/items/${saved.id}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds }) });
              onSaved(saved);
              return task ? '' : 'Added the task.';
            }, 'Could not save the task')
            .then((saved) => saved && onClose());
        }}
      >
        <fieldset className="m-0 grid gap-4 border-0 p-0" disabled={!editable}>
          <TextField
            autoFocus={!task}
            hint={
              understood ? (
                <>
                  Understood: <span role="status">{understood}</span>
                </>
              ) : undefined
            }
            label="Title"
            maxLength={200}
            onChange={(event) => setTitle(event.currentTarget.value)}
            value={title}
            {...form.field('title')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <DatePicker defaultValue={task?.dueDate ?? ''} disabled={!editable} label="Due date" name="dueDate" />
            <TimeField defaultValue={task?.dueTime ?? ''} disabled={!editable} label="Time" name="dueTime" />
            <Select defaultValue={task?.repeatRule ?? ''} disabled={!editable} label="Repeats" name="repeatRule" options={repeatOptions(task?.repeatRule)} />
            <Select
              defaultValue={task?.reminderMinutes == null ? '' : String(task.reminderMinutes)}
              disabled={!editable}
              label="Reminder"
              name="reminderMinutes"
              options={reminderOptions(task?.reminderMinutes)}
            />
            <Select
              defaultValue={task ? (task.listId ?? '') : (defaultListId ?? '')}
              disabled={!editable}
              label="List"
              name="listId"
              options={[{ value: '', label: 'No list' }, ...lists.map((list) => ({ value: list.id, label: list.title }))]}
            />
            <Select
              defaultValue={task?.assignee?.id ?? ''}
              disabled={!editable}
              label="Assigned to"
              name="assigneeId"
              options={[{ value: '', label: 'Nobody' }, ...members.map((member) => ({ value: member.userId, label: member.displayName }))]}
            />
            <Select defaultValue={String(task?.priority ?? 0)} disabled={!editable} label="Priority" name="priority" options={priorities} />
          </div>
        </fieldset>
        {zone && <p className="mono-sm m-0 text-faint">Times are in {zone}.</p>}
        <DialogActions>
          {task && editable && onTrashed && (
            <button
              className="text-button mr-auto text-sm"
              disabled={saving.busy}
              onClick={() =>
                void saving
                  .run(async () => {
                    await auth.request(`/items/${task.id}/trash`, { method: 'POST' });
                    onTrashed();
                    return {
                      message: 'Moved the task to the trash.',
                      undo: async () => {
                        await auth.request(`/items/${task.id}/restore`, { method: 'POST' });
                        onRestored?.();
                        return '';
                      },
                    };
                  }, 'Could not move the task to the trash')
                  .then((trashed) => trashed && onClose())
              }
              type="button"
            >
              Move to trash
            </button>
          )}
          <Button label={editable ? 'Cancel' : 'Close'} large onClick={onClose} />
          {editable && (
            <Button disabled={saving.busy} label={saving.busy ? 'Saving…' : task ? 'Save' : 'Add task'} large primary submit />
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
