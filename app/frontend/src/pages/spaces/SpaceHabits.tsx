import { useState } from 'react';
import { ConfirmDialog, EmptyState, Icon, ListSkeleton, Menu, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { FormDialog } from '../../components/FormDialog';
import { HeaderButton, Toolbar } from '../../components/Page';
import { LoadError } from '../../components/LoadError';
import { goalText, HabitRow, type Habit } from '../../habits';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';

function GoalSelect({ defaultValue = 7 }: { defaultValue?: number }) {
  return (
    <Select
      defaultValue={String(defaultValue)}
      label="Goal"
      name="perWeek"
      options={[7, 6, 5, 4, 3, 2, 1].map((days) => ({ value: String(days), label: goalText(days).replace(/^./, (first) => first.toUpperCase()) }))}
    />
  );
}

const nameRules = [required('Name the habit.'), atMost(80, 'Use at most 80 characters.')];

export function SpaceHabits() {
  const auth = useAuth();
  const space = useSpace();
  const habits = useResource<Habit[]>(`/spaces/${space.id}/habits`, true);
  const saving = useAction();
  const habitForm = useFormErrors();
  const [editing, setEditing] = useState<Habit | 'new'>();
  const [deleting, setDeleting] = useState<Habit>();
  const editable = space.role !== 'viewer';
  const replace = (next: Habit) => habits.mutate((current) => current.map((habit) => (habit.id === next.id ? next : habit)));

  if (habits.error) return <LoadError error={habits.error} onRetry={habits.reload} />;
  if (!habits.data) return <ListSkeleton label="Loading the habits in this space" rows={3} />;

  return (
    <div className="fade-in grid gap-6">
      <Toolbar actions={editable && <HeaderButton icon="plus" label="New habit" onClick={() => setEditing('new')} primary />} />
      {habits.data.length === 0 ? (
        <EmptyState title="No habits yet" />
      ) : (
        <ul className="panel-rows">
          {habits.data.map((habit) => (
            <li className="panel-row flex items-center gap-3" key={habit.id}>
              <div className="min-w-0 flex-1">
                <HabitRow habit={habit} onChange={replace} />
              </div>
              {editable && (
                <Menu
                  items={[
                    { label: 'Edit', onSelect: () => setEditing(habit) },
                    { label: 'Delete', onSelect: () => setDeleting(habit), separated: true },
                  ]}
                  label={`${habit.name} actions`}
                  trigger={<Icon name="more" size={18} />}
                  triggerClassName="icon-button"
                  triggerLabel={`Actions for ${habit.name}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FormDialog
          busy={saving.busy}
          busyLabel="Saving…"
          onClose={() => setEditing(undefined)}
          onSubmit={(form) => {
            if (!habitForm.check(form, { name: nameRules })) return;
            const values = new FormData(form);
            const body = JSON.stringify({ name: String(values.get('name')).trim(), perWeek: Number(values.get('perWeek')) });
            void saving
              .run(async () => {
                if (editing === 'new') {
                  const created = await auth.request<Habit>(`/spaces/${space.id}/habits`, { method: 'POST', body });
                  habits.mutate((current) => [...current, created]);
                } else {
                  replace(await auth.request<Habit>(`/habits/${editing.id}`, { method: 'PATCH', body }));
                }
                return '';
              }, editing === 'new' ? 'Could not add the habit' : 'Could not save the habit')
              .then((saved) => saved && setEditing(undefined));
          }}
          submitLabel={editing === 'new' ? 'Add habit' : 'Save'}
          title={editing === 'new' ? 'New habit' : 'Edit habit'}
        >
          <TextField autoFocus defaultValue={editing === 'new' ? '' : editing.name} label="Name" maxLength={80} {...habitForm.field('name')} />
          <GoalSelect defaultValue={editing === 'new' ? 7 : editing.perWeek} />
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
