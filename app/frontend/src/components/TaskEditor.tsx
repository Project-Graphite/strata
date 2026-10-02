import { Dialog, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { reminderPresets, repeatPresets, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors } from '../validation';

interface Member {
  userId: string;
  displayName: string;
}

export function TaskEditor({
  editable,
  lists,
  members,
  onClose,
  onSaved,
  task,
}: {
  editable: boolean;
  lists: TaskList[];
  members: Member[];
  onClose: () => void;
  onSaved: (task: Task) => void;
  task: Task;
}) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const custom = task.repeatRule && !repeatPresets.some(([value]) => value === task.repeatRule);
  const text = (values: FormData, name: string) => String(values.get(name) ?? '').trim();

  return (
    <Dialog eyebrow="task" onClose={onClose} title={editable ? 'Edit task' : task.title}>
      <form
        className="mt-5 grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          if (!form.check(target, { title: [required('Give the task a title.'), atMost(200, 'Use at most 200 characters.')] })) {
            return;
          }
          const values = new FormData(target);
          const reminder = text(values, 'reminderMinutes');
          void saving
            .run(async () => {
              const saved = await auth.request<Task>(`/tasks/${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  title: text(values, 'title'),
                  listId: text(values, 'listId') || null,
                  dueDate: text(values, 'dueDate') || null,
                  dueTime: text(values, 'dueTime') || null,
                  repeatRule: text(values, 'repeatRule') || null,
                  reminderMinutes: reminder ? Number(reminder) : null,
                  assigneeId: text(values, 'assigneeId') || null,
                  priority: Number(text(values, 'priority')),
                }),
              });
              onSaved(saved);
              return '';
            }, 'Could not save the task')
            .then((saved) => saved && onClose());
        }}
      >
        <fieldset className="m-0 grid gap-4 border-0 p-0" disabled={!editable}>
          <TextField defaultValue={task.title} label="Title" maxLength={200} {...form.field('title')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">
              Due date
              <input defaultValue={task.dueDate ?? ''} name="dueDate" type="date" />
            </label>
            <label className="field-label">
              Time
              <input defaultValue={task.dueTime ?? ''} name="dueTime" type="time" />
            </label>
            <label className="field-label">
              Repeats
              <select defaultValue={task.repeatRule ?? ''} name="repeatRule">
                {repeatPresets.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {custom && <option value={task.repeatRule!}>Custom ({task.repeatRule})</option>}
              </select>
            </label>
            <label className="field-label">
              Reminder
              <select defaultValue={task.reminderMinutes === null ? '' : String(task.reminderMinutes)} name="reminderMinutes">
                {reminderPresets.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {task.reminderMinutes !== null && !reminderPresets.some(([value]) => value === String(task.reminderMinutes)) && (
                  <option value={task.reminderMinutes}>{task.reminderMinutes} minutes before</option>
                )}
              </select>
            </label>
            <label className="field-label">
              List
              <select defaultValue={task.listId ?? ''} name="listId">
                <option value="">No list</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Assigned to
              <select defaultValue={task.assignee?.id ?? ''} name="assigneeId">
                <option value="">Nobody</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Priority
              <select defaultValue={String(task.priority)} name="priority">
                <option value="0">None</option>
                <option value="1">Low</option>
                <option value="2">Medium</option>
                <option value="3">High</option>
              </select>
            </label>
          </div>
        </fieldset>
        <p className="mono-sm m-0 text-faint">Times are in {task.timeZone.replaceAll('_', ' ')}.</p>
        {saving.status}
        <div className="flex justify-end gap-3">
          <button className="secondary-button" onClick={onClose} type="button">
            {editable ? 'Cancel' : 'Close'}
          </button>
          {editable && (
            <button className="primary-button" disabled={saving.busy} type="submit">
              {saving.busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
