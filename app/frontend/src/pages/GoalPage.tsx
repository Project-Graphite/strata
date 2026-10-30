import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Checkbox, Fieldset, type MenuItem, Meter, Skeleton, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { GoalEditor } from '../components/GoalEditor';
import { Hint } from '../components/Hint';
import { LinkItemDialog } from '../components/LinkItemDialog';
import { DetailState, Page, Section } from '../components/Page';
import { ButtonSkeleton, HabitRowSkeleton, HintSkeleton, IconButtonSkeleton, rowsOf, SkeletonLine, TaskRowsSkeleton, useRememberedShape } from '../components/Skeletons';
import { OpenTask } from '../components/OpenTask';
import type { Page as ResultPage } from '../api';
import { periodLabel, progressText, statusLabels, type GoalDetail, type GoalStatus } from '../goals';
import { HabitRow, type Habit } from '../habits';
import { useSpaces } from '../spaces';
import { dueLabel, taskDetails, TaskRow, type Task } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { useFormErrors, type Check } from '../validation';

const emptyTasks = { title: 'No tasks yet', hint: 'Link the tasks that move this goal forward, or add new ones.' };
const emptyHabits = { title: 'No habits yet', hint: 'Choose the habits from this space that build towards this goal.' };

const numberCheck: Check = (value) => (Number.isFinite(Number(value.trim().replace(',', '.'))) && value.trim() ? undefined : 'Enter a number such as 12.5.');

export function GoalPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const goal = useResource<GoalDetail>(`/goals/${id}`, true);
  const spaceId = goal.data?.spaceId;
  const action = useAction();
  const progressForm = useFormErrors();
  const [editing, setEditing] = useState(false);
  const [taskEditing, setTaskEditing] = useState<Task | 'new'>();
  const [dialog, setDialog] = useState<'progress' | 'link' | 'habits'>();
  const openTasks = useResource<ResultPage<Task>>(dialog === 'link' && spaceId ? `/spaces/${spaceId}/tasks?page=1` : null, true);

  const space = spaces.data?.find((candidate) => candidate.id === spaceId);
  const editable = Boolean(space && space.role !== 'viewer');
  const [wasEditable, whyLines, metered, targeted, taskRows, detailedTasks, habitRows] = useRememberedShape(
    `goal-${id}`,
    goal.data &&
      spaces.data && [
        Number(editable),
        goal.data.why ? goal.data.why.split('\n').length : 0,
        Number(goal.data.progress !== null),
        Number(goal.data.target !== null),
        goal.data.taskList.length,
        goal.data.taskList.filter((task) => taskDetails(task).length > 0).length,
        goal.data.habits.length,
      ],
    [1, 0, 1, 1, 3, 3, 0],
  );

  const back = { to: '/goals', label: 'Goals' };
  if (!goal.data) {
    return (
      <DetailState back={back} menu={wasEditable > 0} primary={wasEditable > 0 && 'Edit'} resource={goal} thing="Goal">
        {whyLines > 0 && (
          <Section title="Why it matters">
            <p aria-hidden="true" className="m-0">
              {rowsOf(whyLines).map((line) => (
                <SkeletonLine key={line} width={line === whyLines - 1 ? 'w-2/5' : 'w-full'} />
              ))}
            </p>
          </Section>
        )}
        <Section action={wasEditable > 0 && targeted > 0 && <ButtonSkeleton width="w-32" />} title="Progress">
          <div className="grid gap-2">
            {metered > 0 && <Skeleton className="h-1.5 rounded-full" />}
            <HintSkeleton />
          </div>
        </Section>
        <Section
          action={
            wasEditable > 0 && (
              <span className="flex items-center gap-2">
                <ButtonSkeleton width="w-24" />
                <IconButtonSkeleton />
              </span>
            )
          }
          title="Tasks"
        >
          {taskRows ? (
            <TaskRowsSkeleton detailed={detailedTasks} rows={taskRows} />
          ) : (
            <Empty loading title={emptyTasks.title}>
              {emptyTasks.hint}
            </Empty>
          )}
        </Section>
        <Section action={wasEditable > 0 && <ButtonSkeleton width="w-32" />} title="Habits">
          {habitRows ? (
            <ul aria-hidden="true" className="panel-rows">
              {rowsOf(habitRows).map((row) => (
                <HabitRowSkeleton key={row} row={row} />
              ))}
            </ul>
          ) : (
            <Empty loading title={emptyHabits.title}>
              {emptyHabits.hint}
            </Empty>
          )}
        </Section>
      </DetailState>
    );
  }
  const shown = goal.data;

  function patch(body: object, done: string) {
    return action.run(async () => {
      const saved = await auth.request<GoalDetail>(`/goals/${shown.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      goal.mutate(() => saved);
      return done;
    }, 'Could not change the goal');
  }

  async function link(taskId: string) {
    await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: taskId, kind: 'reference' }) });
    goal.reload();
  }

  const statusItems: MenuItem[] = [
    ...(['active', 'done', 'dropped'] as GoalStatus[])
      .filter((status) => status !== shown.status)
      .map((status) => ({
        label: status === 'active' ? 'Make active again' : status === 'done' ? 'Mark as done' : 'Drop this goal',
        onSelect: () => void patch({ status }, status === 'done' ? `Marked ${shown.title} as done.` : status === 'dropped' ? `Dropped ${shown.title}.` : `Made ${shown.title} active again.`),
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
            <ActionsMenu items={statusItems} name={shown.title} />
            <Button icon="pencil" label="Edit" large onClick={() => setEditing(true)} primary />
          </>
        )
      }
      back={back}
      description={`${shown.spaceName} · ${periodLabel(shown.period, shown.startsOn)}${shown.status === 'active' ? '' : ` · ${statusLabels[shown.status]}`}`}
      title={shown.title}
    >
      {shown.why && (
        <Section title="Why it matters">
          <p className="m-0 whitespace-pre-wrap text-ink">{shown.why}</p>
        </Section>
      )}

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
            <span className="flex items-center gap-2">
              <Button icon="plus" label="New task" onClick={() => setTaskEditing('new')} />
              <ActionsMenu items={[{ label: 'Link a task…', onSelect: () => setDialog('link') }]} name="tasks" />
            </span>
          )
        }
        title="Tasks"
      >
        {shown.taskList.length === 0 ? (
          <Empty title={emptyTasks.title}>{emptyTasks.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {shown.taskList.map((task) => (
              <TaskRow
                actions={
                  editable && (
                    <ActionsMenu
                      items={[
                        {
                          label: 'Remove from this goal',
                          onSelect: () =>
                            void action.run(async () => {
                              await auth.request(`/items/${shown.id}/links/${task.linkId}`, { method: 'DELETE' });
                              goal.reload();
                              return {
                                message: `Removed ${task.title} from this goal.`,
                                undo: async () => {
                                  await link(task.id);
                                  return '';
                                },
                              };
                            }, 'Could not remove the task from this goal'),
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
          <Empty title={emptyHabits.title}>{emptyHabits.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {shown.habits.map((habit) => (
              <HabitRow habit={habit} key={habit.id} onChange={(next) => goal.mutate((current) => ({ ...current, habits: current.habits.map((kept) => (kept.id === next.id ? next : kept)) }))} />
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
            void patch({ current: Number(String(new FormData(target).get('current')).trim().replace(',', '.')) }, `Saved the progress of ${shown.title}.`).then(
              (saved) => saved && setDialog(undefined),
            );
          }}
          submitLabel="Save progress"
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
          busy={action.busy}
          choices={openTasks.data?.results.filter((task) => !shown.taskList.some((linked) => linked.id === task.id)).map((task) => ({ value: task.id, label: task.title, hint: dueLabel(task) || undefined }))}
          empty={`Every open task in ${shown.spaceName} is already linked.`}
          noun="task"
          onClose={() => setDialog(undefined)}
          onLink={(taskId) =>
            void action
              .run(async () => {
                await link(taskId);
                return `Linked ${openTasks.data?.results.find((task) => task.id === taskId)?.title ?? 'the task'}.`;
              }, 'Could not link the task')
              .then((done) => done && setDialog(undefined))
          }
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

      {taskEditing && (
        <OpenTask
          onChanged={() => goal.reload()}
          onClose={() => setTaskEditing(undefined)}
          onCreated={(saved) =>
            void action.run(async () => {
              await link(saved.id);
              return '';
            }, 'Could not link the task')
          }
          spaceId={shown.spaceId}
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
          return `Saved the habits for ${goal.title}.`;
        }, 'Could not save the habits');
      }}
      submitLabel="Save habits"
      title="Habits for this goal"
    >
      {habits.data && habits.data.length === 0 ? (
        <Hint>{goal.spaceName} has no habits yet.</Hint>
      ) : (
        <Fieldset className="gap-3" legend="Follow these habits">
          {(habits.data ?? []).map((habit) => (
            <Checkbox defaultChecked={goal.habits.some((followed) => followed.id === habit.id)} key={habit.id} label={habit.name} name="habitId" value={habit.id} />
          ))}
        </Fieldset>
      )}
    </FormDialog>
  );
}
