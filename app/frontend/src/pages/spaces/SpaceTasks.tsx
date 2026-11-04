import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { SegmentedControl, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { AddButton } from '../../components/Button';
import { FormDialog } from '../../components/FormDialog';
import { Toolbar, usePagePrimary } from '../../components/Page';
import { ButtonSkeleton, IconButtonSkeleton } from '../../components/Skeletons';
import { useTaskColumns } from '../../components/TaskColumns';
import { TaskPanel } from '../../components/TaskPanel';
import { FilterMenu } from '../../components/FilterMenu';
import { spaceHref } from '../../spaces';
import { noFilterChoices, taskFilterQuery, taskFilters, taskFilterState, taskLink, taskViews, type TaskFilterChoices, type TaskList } from '../../tasks';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';

export function SpaceTasks() {
  const auth = useAuth();
  const space = useSpace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state = taskFilterState(params);
  const { completed, listId, view } = state;
  const page = Number(params.get('page')) || 1;
  const lists = useResource<TaskList[]>(`/spaces/${space.id}/lists`, true);
  const columns = useTaskColumns(space.id, listId, space.role !== 'viewer');
  const choices = useResource<TaskFilterChoices>(`/me/task-filters?spaceId=${space.id}`, true, { live: ['tasks'] });
  const action = useAction();
  const listForm = useFormErrors();
  const [creating, setCreating] = useState(false);
  const [listDialog, setListDialog] = useState<'new' | 'rename'>();
  const editable = space.role !== 'viewer';
  const link = taskLink(spaceHref(space, 'tasks'), state);
  const shownList = lists.data?.find((list) => list.id === listId);
  usePagePrimary(
    editable && (
      <span className="page-primary-action">
        <AddButton label="New task" large onClick={() => setCreating(true)} primary />
      </span>
    ),
  );

  return (
    <>
      <Toolbar
        actions={
          <>
            {columns.add && view === 'board' && <AddButton label="Add column" onClick={columns.add} />}
            <SegmentedControl label="View" onChange={(next) => navigate(link({ view: next, completed: false, page: 1 }))} options={taskViews} value={view} />
          </>
        }
      >
        {lists.data ? (
          <FilterMenu groups={taskFilters({ choices: choices.data ?? noFilterChoices, defaultAssignee: 'Anyone', link, lists: lists.data, state })} label="Filter tasks">
            {
              editable &&
              shownList && (
                <ActionsMenu
                  items={[
                    { label: 'Rename epic', onSelect: () => setListDialog('rename') },
                    {
                      label: 'Move to trash',
                      separated: true,
                      onSelect: () =>
                        void action.run(async () => {
                          await auth.request(`/items/${shownList.id}/trash`, { method: 'POST' });
                          lists.mutate((current) => current.filter((list) => list.id !== shownList.id));
                          navigate(link({ list: null }));
                          return {
                            message: `Moved ${shownList.title} to the trash. Its tasks stay in this space.`,
                            undo: async () => {
                              await auth.request(`/items/${shownList.id}/restore`, { method: 'POST' });
                              lists.reload();
                              navigate(link({ list: shownList.id }));
                              return '';
                            },
                          };
                        }, 'Could not move the epic to the trash'),
                    },
                  ]}
                  name={shownList.title}
                />
              )
            }
            {editable && <AddButton label="New epic" onClick={() => setListDialog('new')} />}
          </FilterMenu>
        ) : (
          <>
            {editable && listId && !lists.error && <IconButtonSkeleton />}
            {!lists.error && <ButtonSkeleton width="w-28" />}
          </>
        )}
      </Toolbar>

      <TaskPanel
        addTo={editable ? { spaceId: space.id, listId: shownList?.id } : undefined}
        columnActions={columns.actions}
        columns={columns.columns}
        completed={completed}
        creating={creating}
        editable={() => editable}
        failed={lists.error ? lists : undefined}
        link={link}
        onClosed={() => setCreating(false)}
        onCreate={() => setCreating(true)}
        onListsChanged={lists.reload}
        page={page}
        query={taskFilterQuery(state)}
        ready={Boolean(lists.data)}
        shape={`space-tasks-${space.id}`}
        tasksPath={`/spaces/${space.id}/tasks`}
        view={view}
        where={(task) => (shownList ? undefined : lists.data?.find((list) => list.id === task.listId)?.title)}
      />

      {listDialog && (
        <FormDialog
          busy={action.busy}
          busyLabel={listDialog === 'rename' ? 'Saving…' : 'Adding…'}
          onClose={() => setListDialog(undefined)}
          onSubmit={(target) => {
            if (!listForm.check(target, { title: [required('Name the epic.'), atMost(100, 'Use at most 100 characters.')] })) return;
            const title = String(new FormData(target).get('title')).trim();
            void action
              .run(
                async () => {
                  if (listDialog === 'rename' && shownList) {
                    await auth.request(`/items/${shownList.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
                    lists.mutate((current) => current.map((list) => (list.id === shownList.id ? { ...list, title } : list)));
                    return `Saved ${title}.`;
                  }
                  const created = await auth.request<TaskList>(`/spaces/${space.id}/lists`, { method: 'POST', body: JSON.stringify({ title }) });
                  lists.mutate((current) => [...current, created]);
                  navigate(link({ list: created.id }));
                  return `Added ${created.title}.`;
                },
                listDialog === 'rename' ? 'Could not rename the epic' : 'Could not add the epic',
              )
              .then((saved) => saved && setListDialog(undefined));
          }}
          submitLabel={listDialog === 'rename' ? 'Save changes' : 'Add epic'}
          title={listDialog === 'rename' ? 'Rename epic' : 'New epic'}
        >
          <TextField autoFocus defaultValue={listDialog === 'rename' ? shownList?.title : ''} label="Name" maxLength={100} {...listForm.field('title')} />
        </FormDialog>
      )}
      {columns.dialogs}
    </>
  );
}
