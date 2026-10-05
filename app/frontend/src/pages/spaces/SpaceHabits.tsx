import { useState } from 'react';
import { ConfirmDialog, ListSkeleton, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { goalText, HabitRow, type Habit } from '../../habits';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';

function GoalSelect({ defaultValue = 7 }: { defaultValue?: number }) {
  return (
    <label className="field-label">
      Goal
      <select defaultValue={defaultValue} name="perWeek">
        {[7, 6, 5, 4, 3, 2, 1].map((days) => (
          <option key={days} value={days}>
            {goalText(days).replace(/^./, (first) => first.toUpperCase())}
          </option>
        ))}
      </select>
    </label>
  );
}

const nameRules = [required('Name the habit.'), atMost(80, 'Use at most 80 characters.')];

export function SpaceHabits() {
  const auth = useAuth();
  const space = useSpace();
  const habits = useResource<Habit[]>(`/spaces/${space.id}/habits`, true);
  const adding = useAction();
  const saving = useAction();
  const addForm = useFormErrors();
  const editForm = useFormErrors();
  const [editing, setEditing] = useState<Habit>();
  const [deleting, setDeleting] = useState<Habit>();
  const editable = space.role !== 'viewer';
  const replace = (next: Habit) => habits.mutate((current) => current.map((habit) => (habit.id === next.id ? next : habit)));

  if (habits.error) return <LoadError error={habits.error} onRetry={habits.reload} />;
  if (!habits.data) return <ListSkeleton label="Loading the habits in this space" rows={3} />;

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      {habits.data.length === 0 ? (
        <p className="m-0 text-muted">No habits yet. Each member checks in for themselves, and streaks are counted per person.</p>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {habits.data.map((habit) => (
            <li className="flex items-center gap-3 border-b border-line-soft py-3" key={habit.id}>
              <div className="min-w-0 flex-1">
                <HabitRow habit={habit} onChange={replace} />
              </div>
              {editable && (
                <button className="text-button shrink-0 text-sm" onClick={() => setEditing(habit)} type="button">
                  Edit
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form
          className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
            if (!addForm.check(target, { name: nameRules })) return;
            const values = new FormData(target);
            void adding
              .run(async () => {
                const created = await auth.request<Habit>(`/spaces/${space.id}/habits`, {
                  method: 'POST',
                  body: JSON.stringify({ name: String(values.get('name')).trim(), perWeek: Number(values.get('perWeek')) }),
                });
                habits.mutate((current) => [...current, created]);
                return '';
              }, 'Could not add the habit')
              .then((added) => added && target.reset());
          }}
        >
          <TextField label="New habit" maxLength={80} {...addForm.field('name')} />
          <GoalSelect />
          <button className="primary-button w-fit" disabled={adding.busy} type="submit">
            {adding.busy ? 'Adding…' : 'Add habit'}
          </button>
        </form>
      )}

      {editing && (
        <FormDialog
          busy={saving.busy}
          busyLabel="Saving…"
          onClose={() => setEditing(undefined)}
          onSubmit={(form) => {
            if (!editForm.check(form, { name: nameRules })) return;
            const values = new FormData(form);
            void saving
              .run(async () => {
                replace(
                  await auth.request<Habit>(`/habits/${editing.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ name: String(values.get('name')).trim(), perWeek: Number(values.get('perWeek')) }),
                  }),
                );
                return '';
              }, 'Could not save the habit')
              .then((saved) => saved && setEditing(undefined));
          }}
          submitLabel="Save"
          title="Edit habit"
        >
          <TextField defaultValue={editing.name} label="Name" maxLength={80} {...editForm.field('name')} />
          <GoalSelect defaultValue={editing.perWeek} />
          <button
            className="text-button w-fit text-sm"
            onClick={() => {
              setDeleting(editing);
              setEditing(undefined);
            }}
            type="button"
          >
            Delete this habit
          </button>
        </FormDialog>
      )}

      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete habit"
          errorFallback="Could not delete the habit"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/habits/${deleting.id}`, { method: 'DELETE' });
            habits.mutate((current) => current.filter((habit) => habit.id !== deleting.id));
            setDeleting(undefined);
          }}
          title={`Delete “${deleting.name}”?`}
        >
          Everyone’s check-ins for it are deleted too.
        </ConfirmDialog>
      )}
    </div>
  );
}
