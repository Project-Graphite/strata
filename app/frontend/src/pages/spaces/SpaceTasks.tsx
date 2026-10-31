import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { SegmentedControl, TextField } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { AddButton } from '../../components/Button';
import { FormDialog } from '../../components/FormDialog';
import { Toolbar, usePagePrimary } from '../../components/Page';
import { ChipsSkeleton, IconButtonSkeleton, useRememberedShape } from '../../components/Skeletons';
import { TaskPanel } from '../../components/TaskPanel';
import { TaskListChips, taskLink, TaskStatusChips, taskViews, type TaskList, type TaskView } from '../../tasks';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { atMost, required, useFormErrors } from '../../validation';
import { useSpace } from './SpaceLayout';

export function SpaceTasks() {
  const auth = useAuth();
  const space = useSpace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const listId = params.get('list');
  const view: TaskView = params.get('view') === 'board' ? 'board' : 'list';
  const completed = view === 'list' && params.get('completed') === 'true';
  const page = Number(params.get('page')) || 1;
  const lists = useResource<TaskList[]>(`/spaces/${space.id}/lists`, true);
  const action = useAction();
  const listForm = useFormErrors();
  const [creating, setCreating] = useState(false);
  const [listDialog, setListDialog] = useState<'new' | 'rename'>();
  const editable = space.role !== 'viewer';
  const link = taskLink(`/spaces/${space.id}/tasks`, listId, completed, view);
  const shownList = lists.data?.find((list) => list.id === listId);
  const [listCount] = useRememberedShape(`space-task-lists-${space.id}`, lists.data && [lists.data.length], [1]);
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
            <SegmentedControl label="View" onChange={(next) => navigate(link({ view: next, completed: false, page: 1 }))} options={taskViews} value={view} />
            {view === 'list' && <TaskStatusChips completed={completed} link={link} />}
          </>
        }
      >
        {lists.data ? (
          <TaskListChips link={link} listId={listId} lists={lists.data} onNewList={editable ? () => setListDialog('new') : undefined} />
        ) : (
          !lists.error && <ChipsSkeleton count={listCount + (editable ? 2 : 1)} />
        )}
        {editable && listId && !lists.data && !lists.error && <IconButtonSkeleton />}
        {editable && shownList && (
          <ActionsMenu
            items={[
              { label: 'Rename list', onSelect: () => setListDialog('rename') },
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
                  }, 'Could not move the list to the trash'),
              },
            ]}
            name={shownList.title}
          />
        )}
      </Toolbar>

      <TaskPanel
        addTo={editable ? { spaceId: space.id, listId: shownList?.id } : undefined}
        completed={completed}
        creating={creating}
        editable={() => editable}
        failed={lists.error ? lists : undefined}
        link={link}
        listId={listId}
        onClosed={() => setCreating(false)}
        onCreate={() => setCreating(true)}
        onListsChanged={lists.reload}
        page={page}
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
            if (!listForm.check(target, { title: [required('Name the list.'), atMost(100, 'Use at most 100 characters.')] })) return;
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
                listDialog === 'rename' ? 'Could not rename the list' : 'Could not add the list',
              )
              .then((saved) => saved && setListDialog(undefined));
          }}
          submitLabel={listDialog === 'rename' ? 'Save changes' : 'Add list'}
          title={listDialog === 'rename' ? 'Rename list' : 'New list'}
        >
          <TextField autoFocus defaultValue={listDialog === 'rename' ? shownList?.title : ''} label="Name" maxLength={100} {...listForm.field('title')} />
        </FormDialog>
      )}
    </>
  );
}
