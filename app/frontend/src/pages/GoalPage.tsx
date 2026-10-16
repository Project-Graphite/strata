import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Meter, PageSkeleton, TextField, type MenuItem } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, IconButton } from '../components/Button';
import { FormDialog } from '../components/FormDialog';
import { GoalEditor } from '../components/GoalEditor';
import { Hint } from '../components/Hint';
import { LinkItemDialog } from '../components/LinkItemDialog';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { TaskEditor } from '../components/TaskEditor';
import type { Page as ResultPage } from '../api';
import { periodLabel, progressText, statusLabels, type GoalDetail, type GoalStatus } from '../goals';
import { HabitRow, type Habit } from '../habits';
import { useSpaces, type Tag } from '../spaces';
import { dueLabel, TaskRow, type Task, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { useFormErrors, type Check } from '../validation';

const numberCheck: Check = (value) => (Number.isFinite(Number(value.trim().replace(',', '.'))) && value.trim() ? undefined : 'Enter a number such as 12.5.');

export function GoalPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const goal = useResource<GoalDetail>(`/goals/${id}`, true);
  const spaceId = goal.data?.spaceId;
  const lists = useResource<TaskList[]>(spaceId ? `/spaces/${spaceId}/lists` : null, true);
  const members = useResource<{ userId: string; displayName: string }[]>(spaceId ? `/spaces/${spaceId}/members` : null, true);
  const tags = useResource<Tag[]>(spaceId ? `/spaces/${spaceId}/tags` : null, true);
  const action = useAction();
  const progressForm = useFormErrors();
  const [editing, setEditing] = useState(false);
  const [taskEditing, setTaskEditing] = useState<Task | 'new'>();
  const [dialog, setDialog] = useState<'progress' | 'link' | 'habits'>();
  const openTasks = useResource<ResultPage<Task>>(dialog === 'link' && spaceId ? `/spaces/${spaceId}/tasks?page=1` : null, true);

  if (goal.error) return <LoadError error={goal.error} onRetry={goal.reload} />;
  if (!goal.data) return <PageSkeleton label="Loading the goal" />;
  const shown = goal.data;
  const space = spaces.data?.find((candidate) => candidate.id === shown.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');

  function patch(body: object, done: string) {
    return action.run(async () => {
      const saved = await auth.request<GoalDetail>(`/goals/${shown.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      goal.mutate(() => saved);
      return done;
    }, 'Could not change the goal');
  }

  function link(taskId: string) {
    return action.run(async () => {
      await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: taskId, kind: 'reference' }) });
      goal.reload();
      return '';
    }, 'Could not link the task');
  }

  const statusItems: MenuItem[] = [
    ...(['active', 'done', 'dropped'] as GoalStatus[])
      .filter((status) => status !== shown.status)
      .map((status) => ({
        label: status === 'active' ? 'Make active again' : status === 'done' ? 'Mark as done' : 'Drop this goal',
        onSelect: () => void patch({ status }, status === 'done' ? 'Goal marked as done.' : status === 'dropped' ? 'Goal dropped.' : 'Goal is active again.'),
      })),
    {
      label: 'Move to trash',
      separated: true,
      onSelect: () =>
        void action.run(async () => {
          await auth.request(`/items/${shown.id}/trash`, { method: 'POST' });
          navigate('/goals');
          return {
            message: `Moved ${shown.title} to the trash.`,
            undo: async () => {
              await auth.request(`/items/${shown.id}/restore`, { method: 'POST' });
              navigate(`/goals/${shown.id}`);
              return '';
            },
          };
        }, 'Could not move the goal to the trash'),
    },
  ];

  return (
    <Page
      actions={
        editable && (
          <>
            <IconButton icon="pencil" label="Edit" onClick={() => setEditing(true)} />
            <ActionsMenu items={statusItems} name={shown.title} />
          </>
        )
      }
      description={shown.why || undefined}
      eyebrow={`${shown.spaceName} · ${periodLabel(shown.period, shown.startsOn)}${shown.status === 'active' ? '' : ` · ${statusLabels[shown.status]}`}`}
      title={shown.title}
    >
      <Section
        action={editable && shown.target !== null && <Button label="Update progress" onClick={() => setDialog('progress')} />}
        title="Progress"
      >
        <div className="grid gap-2">
          {shown.progress !== null && <Meter label={`Progress of ${shown.title}`} value={shown.progress} />}
          <Hint>
            {shown.progress !== null && `${Math.round(shown.progress * 100)}% · `}
            {progressText(shown)}
          </Hint>
        </div>
      </Section>

      <Section
        action={
          editable && (
            <div className="flex flex-wrap gap-2">
              <Button icon="link" label="Link a task" onClick={() => setDialog('link')} />
              <Button icon="plus" label="New task" onClick={() => setTaskEditing('new')} />
            </div>
          )
        }
        title="Tasks"
      >
        {shown.taskList.length === 0 ? (
          <Hint>No tasks linked yet.</Hint>
        ) : (
          <ul className="panel-rows">
            {shown.taskList.map((task) => (
              <TaskRow
                actions={
                  editable && (
                    <ActionsMenu
                      items={[
                        {
                          label: 'Unlink from this goal',
                          onSelect: () =>
                            void action.run(async () => {
                              await auth.request(`/items/${shown.id}/links/${task.linkId}`, { method: 'DELETE' });
                              goal.reload();
                              return '';
                            }, 'Could not unlink the task'),
                        },
                      ]}
                      name={task.title}
                    />
                  )
                }
                disabled={!editable || action.busy}
                key={task.id}
                onEdit={() => setTaskEditing(task)}
                onToggle={() =>
                  void action.run(async () => {
                    await auth.request<Task>(`/tasks/${task.id}/${task.completedAt ? 'reopen' : 'complete'}`, { method: 'POST' });
                    goal.reload();
                    return '';
                  }, 'Could not update the task')
                }
                task={task}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section action={editable && <Button label="Choose habits" onClick={() => setDialog('habits')} />} title="Habits">
        {shown.habits.length === 0 ? (
          <Hint>No habits linked yet.</Hint>
        ) : (
          <ul className="panel-rows">
            {shown.habits.map((habit) => (
              <li className="panel-row" key={habit.id}>
                <HabitRow habit={habit} onChange={(next) => goal.mutate((current) => ({ ...current, habits: current.habits.map((kept) => (kept.id === next.id ? next : kept)) }))} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing && space && <GoalEditor goal={shown} onClose={() => setEditing(false)} onSaved={(saved) => goal.mutate((current) => ({ ...current, ...saved }))} spaces={[space]} />}

      {dialog === 'progress' && (
        <FormDialog
          busy={action.busy}
          busyLabel="Saving…"
          onClose={() => setDialog(undefined)}
          onSubmit={(target) => {
            if (!progressForm.check(target, { current: [numberCheck] })) return;
            void patch({ current: Number(String(new FormData(target).get('current')).trim().replace(',', '.')) }, 'Progress updated.').then(
              (saved) => saved && setDialog(undefined),
            );
          }}
          submitLabel="Save"
          title="Update progress"
        >
          <TextField
            autoFocus
            defaultValue={shown.current ?? 0}
            hint={`The goal is ${shown.target?.toLocaleString()}${shown.unit ? ` ${shown.unit}` : ''}.`}
            inputMode="decimal"
            label="So far"
            {...progressForm.field('current')}
          />
        </FormDialog>
      )}

      {dialog === 'link' && (
        <LinkItemDialog
          choices={openTasks.data?.results.filter((task) => !shown.taskList.some((linked) => linked.id === task.id)).map((task) => ({ value: task.id, label: task.title, hint: dueLabel(task) || undefined }))}
          empty={`Every open task in ${shown.spaceName} is already linked.`}
          noun="task"
          onClose={() => setDialog(undefined)}
          onLink={(taskId) => void link(taskId).then((done) => done && setDialog(undefined))}
          title="Link a task"
        />
      )}

      {dialog === 'habits' && (
        <HabitsDialog
          goal={shown}
          onClose={() => setDialog(undefined)}
          onSaved={(saved) => {
            goal.mutate(() => saved);
            setDialog(undefined);
          }}
        />
      )}

      {taskEditing && lists.data && (
        <TaskEditor
          editable={editable}
          lists={lists.data}
          members={members.data ?? []}
          onClose={() => setTaskEditing(undefined)}
          onSaved={(saved) => {
            if (taskEditing === 'new') void link(saved.id);
            else goal.reload();
          }}
          onRestored={() => goal.reload()}
          onTrashed={() => goal.reload()}
          spaceId={shown.spaceId}
          tags={tags.data ?? []}
          task={taskEditing === 'new' ? undefined : taskEditing}
        />
      )}
    </Page>
  );
}

function HabitsDialog({ goal, onClose, onSaved }: { goal: GoalDetail; onClose: () => void; onSaved: (goal: GoalDetail) => void }) {
  const auth = useAuth();
  const saving = useAction();
  const habits = useResource<Habit[]>(`/spaces/${goal.spaceId}/habits`, true);

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        const habitIds = new FormData(target).getAll('habitId').map(String);
        void saving.run(async () => {
          onSaved(await auth.request<GoalDetail>(`/goals/${goal.id}/habits`, { method: 'PUT', body: JSON.stringify({ habitIds }) }));
          return '';
        }, 'Could not save the habits');
      }}
      submitLabel="Save"
      title="Habits for this goal"
    >
      {habits.data && habits.data.length === 0 ? (
        <Hint>{goal.spaceName} has no habits yet.</Hint>
      ) : (
        <fieldset className="m-0 grid gap-3 border-0 p-0">
          <legend className="field-label mb-1 p-0">Follow these habits</legend>
          {(habits.data ?? []).map((habit) => (
            <label className="flex items-center gap-3 text-ink" key={habit.id}>
              <input defaultChecked={goal.habits.some((followed) => followed.id === habit.id)} name="habitId" type="checkbox" value={habit.id} />
              {habit.name}
            </label>
          ))}
        </fieldset>
      )}
    </FormDialog>
  );
}
