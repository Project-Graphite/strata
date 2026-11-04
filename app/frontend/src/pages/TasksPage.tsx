import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { SegmentedControl, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { AddButton } from '../components/Button';
import { FormDialog } from '../components/FormDialog';
import { Page } from '../components/Page';
import { FilterMenu } from '../components/FilterMenu';
import { ButtonSkeleton } from '../components/Skeletons';
import { TaskPanel } from '../components/TaskPanel';
import { useSpaces } from '../spaces';
import { noFilterChoices, taskFilterQuery, taskFilters, taskFilterState, taskLink, taskViews, type Task, type TaskColumn, type TaskFilterChoices, type TaskList } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';

export function TasksPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const [params, setParams] = useSearchParams();
  const state = taskFilterState(params);
  const { completed, listId, view } = state;
  const page = Number(params.get('page')) || 1;
  const lists = useResource<TaskList[]>('/me/lists', true);
  const choices = useResource<TaskFilterChoices>('/me/task-filters', true, { live: ['tasks'] });
  const columns = useResource<TaskColumn[]>('/me/task-columns', true, { live: ['tasks'] });
  const action = useAction();
  const listForm = useFormErrors();
  const [creatingList, setCreatingList] = useState(false);
  const [creating, setCreating] = useState(false);
  const closeLinked = useCallback(
    () =>
      setParams(
        (current) => {
          current.delete('task');
          return current;
        },
        { replace: true },
      ),
    [setParams],
  );
  const spaceOf = (id: string) => spaces.data?.find((space) => space.id === id);
  const editableSpaces = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const personal = spaces.data?.[0];
  const link = taskLink('/tasks', state);
  const shownList = lists.data?.find((list) => list.id === listId);
  const addTo = shownList ? spaceOf(shownList.spaceId) : personal;
  const whereOf = (task: Task) =>
    [(spaces.data?.length ?? 0) > 1 && spaceOf(task.spaceId)?.name, !shownList && lists.data?.find((list) => list.id === task.listId)?.title].filter(Boolean).join(' · ') || undefined;

  return (
    <Page
      actions={
        addTo &&
        addTo.role !== 'viewer' && (
          <span className="page-primary-action">
            <AddButton label="New task" large onClick={() => setCreating(true)} primary />
          </span>
        )
      }
      title="Tasks"
      toolbar={
        lists.data ? (
          <FilterMenu groups={taskFilters({ choices: choices.data ?? noFilterChoices, defaultAssignee: listId ? 'Anyone' : 'Me or unassigned', link, lists: lists.data, state })} label="Filter tasks">
            {editableSpaces.length > 0 && <AddButton label="New epic" onClick={() => setCreatingList(true)} />}
          </FilterMenu>
        ) : (
          !lists.error && <ButtonSkeleton width="w-28" />
        )
      }
      toolbarEnd={<SegmentedControl label="View" onChange={(next) => navigate(link({ view: next, completed: false, page: 1 }))} options={taskViews} value={view} />}
    >
      <TaskPanel
        addTo={addTo && addTo.role !== 'viewer' ? { spaceId: addTo.id, listId: shownList?.id } : undefined}
        columns={columns.data ?? []}
        completed={completed}
        creating={creating}
        editable={(task) => spaceOf(task.spaceId)?.role !== 'viewer'}
        failed={[lists, spaces].find((resource) => resource.error)}
        link={link}
        linkedTask={params.get('task')}
        onCloseLinked={closeLinked}
        onClosed={() => setCreating(false)}
        onCreate={() => setCreating(true)}
        onListsChanged={lists.reload}
        page={page}
        query={taskFilterQuery(state)}
        ready={Boolean(lists.data && spaces.data)}
        shape="tasks"
        tasksPath="/me/tasks"
        view={view}
        where={whereOf}
      />

      {creatingList && (
        <FormDialog
          busy={action.busy}
          busyLabel="Adding…"
          onClose={() => setCreatingList(false)}
          onSubmit={(target) => {
            if (!listForm.check(target, { title: [required('Name the epic.'), atMost(100, 'Use at most 100 characters.')] })) return;
            const values = new FormData(target);
            void action
              .run(async () => {
                const created = await auth.request<TaskList>(`/spaces/${String(values.get('spaceId'))}/lists`, {
                  method: 'POST',
                  body: JSON.stringify({ title: String(values.get('title')).trim() }),
                });
                lists.mutate((current) => [...current, created]);
                navigate(link({ list: created.id, completed: false, page: 1 }));
                return `Added ${created.title}.`;
              }, 'Could not add the epic')
              .then((saved) => saved && setCreatingList(false));
          }}
          submitLabel="Add epic"
          title="New epic"
        >
          <TextField autoFocus label="Name" maxLength={100} {...listForm.field('title')} />
          <input name="spaceId" type="hidden" value={editableSpaces[0]!.id} />
        </FormDialog>
      )}
    </Page>
  );
}
