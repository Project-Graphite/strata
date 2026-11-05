import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { TagChip, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { homePath } from '../spaces';
import { noFilterChoices, shownTaskView, taskFilterQuery, taskFilters, taskFilterState, taskLink, taskViews, type Task, type TaskFilterChoices, type TaskList, type TaskView } from '../tasks';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { ActionsMenu } from './ActionsMenu';
import { AddButton } from './Button';
import { FilterMenu } from './FilterMenu';
import { FormDialog } from './FormDialog';
import type { NestedMenuItem } from './NestedMenu';
import { usePagePrimary } from './Page';
import { IconButtonSkeleton } from './Skeletons';
import { useTaskColumns } from './TaskColumns';
import { TaskPanel } from './TaskPanel';

function relayed(items: NestedMenuItem[], latest: RefObject<NestedMenuItem[]>, path: number[] = []): NestedMenuItem[] {
  return items.map((item, index) => {
    const at = [...path, index];
    if ('items' in item) return { ...item, items: relayed(item.items, latest, at) };
    if (!('onSelect' in item)) return item;
    return {
      ...item,
      onSelect: () => {
        let found: NestedMenuItem | undefined;
        let level = latest.current;
        for (const step of at) {
          found = level[step];
          level = found && 'items' in found ? found.items : [];
        }
        if (found && 'onSelect' in found) found.onSelect();
      },
    };
  });
}

export function TaskWorkspace({
  base,
  defaultAssignee,
  editable,
  editableTask,
  failed,
  linked = false,
  listsPath,
  menuInto,
  ready,
  shape,
  spaceId,
  spaceView,
  tasksPath,
}: {
  base: string;
  defaultAssignee: (listId: string | null) => string;
  editable: boolean;
  editableTask: (task: Task) => boolean;
  failed?: { error: string; reload: () => void };
  linked?: boolean;
  listsPath: string;
  menuInto?: (items: NestedMenuItem[]) => void;
  ready: boolean;
  shape: string;
  spaceId: string | null;
  spaceView?: TaskView;
  tasksPath: string;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  const listForm = useFormErrors();
  const [params, setParams] = useSearchParams();
  const state = taskFilterState(params);
  const { completed, listId } = state;
  const page = Number(params.get('page')) || 1;
  const lists = useResource<TaskList[]>(listsPath, true, { live: ['tasks'] });
  const choices = useResource<TaskFilterChoices>(`/me/task-filters?${spaceId ? `spaceId=${spaceId}` : 'home=account'}`, true, { live: ['tasks'] });
  const columns = useTaskColumns(spaceId, listId, editable);
  const [creating, setCreating] = useState(editable && params.get('new') === 'task');
  const [listDialog, setListDialog] = useState<'new' | 'rename'>();
  const link = taskLink(base, state);
  const shownList = lists.data?.find((list) => list.id === listId);
  const view = shownTaskView(state, shownList, spaceView);
  const filters = lists.data && taskFilters({ choices: choices.data ?? noFilterChoices, defaultAssignee: defaultAssignee(listId), link, lists: lists.data, state, view });

  useEffect(() => {
    if (!params.has('new')) return;
    setParams(
      (current) => {
        current.delete('new');
        return current;
      },
      { replace: true },
    );
  }, [params, setParams]);

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

  function chooseView(next: TaskView) {
    if (!shownList || !editable) {
      navigate(link({ view: next, page: 1 }));
      return;
    }
    const before = shownList.view;
    lists.mutate((current) => current.map((list) => (list.id === shownList.id ? { ...list, view: next } : list)));
    if (state.view) navigate(link({ view: null, page: 1 }));
    void action
      .run(async () => {
        await auth.request(`/lists/${shownList.id}/view`, { method: 'PUT', body: JSON.stringify({ view: next }) });
        return `${shownList.title} shows as a ${next} now.`;
      }, 'Could not change how the epic shows')
      .then((saved) => saved || lists.mutate((current) => current.map((list) => (list.id === shownList.id ? { ...list, view: before } : list))));
  }

  function trashList(list: TaskList) {
    void action.run(async () => {
      await auth.request(`/items/${list.id}/trash`, { method: 'POST' });
      lists.mutate((current) => current.filter((shown) => shown.id !== list.id));
      navigate(link({ list: null }));
      return {
        message: `Moved ${list.title} to the trash. Its tasks stay where they are.`,
        undo: async () => {
          await auth.request(`/items/${list.id}/restore`, { method: 'POST' });
          lists.reload();
          navigate(link({ list: list.id }));
          return '';
        },
      };
    }, 'Could not move the epic to the trash');
  }

  const menu: NestedMenuItem[] = [
    ...(editable ? [{ label: 'New epic', onSelect: () => setListDialog('new') }] : []),
    { label: 'View', items: taskViews.map((option) => ({ label: option.label, selected: view === option.value, onSelect: () => chooseView(option.value) })) },
    ...(columns.add && view === 'board' ? [{ label: 'Add column', onSelect: columns.add }] : []),
    ...(editable && shownList
      ? [
          { label: 'Rename epic', separated: true, onSelect: () => setListDialog('rename') },
          { label: 'Move epic to trash', onSelect: () => trashList(shownList) },
        ]
      : []),
  ];

  const latestMenu = useRef(menu);
  latestMenu.current = menu;
  const menuShape = filters ? JSON.stringify(menu, (_key, value: unknown) => (typeof value === 'function' ? undefined : value)) : '';
  useEffect(() => {
    if (!menuInto || !menuShape) return;
    menuInto(relayed(latestMenu.current, latestMenu));
    return () => menuInto([]);
  }, [menuInto, menuShape]);

  usePagePrimary(
    <>
      {!menuInto && (filters ? <ActionsMenu items={menu} name={shownList?.title ?? 'Tasks'} /> : !lists.error && <IconButtonSkeleton />)}
      {filters ? <FilterMenu compact groups={filters} label="Filter tasks" /> : !lists.error && <IconButtonSkeleton />}
      {editable && (
        <span className="page-primary-action">
          <AddButton label="New task" large onClick={() => setCreating(true)} primary />
        </span>
      )}
    </>,
  );

  const chips = (filters ?? []).flatMap((group) => {
    const active = group.options.findIndex((option) => option.active);
    return active > 0 ? [{ group: group.label, label: group.options[active]!.label, reset: group.options[0]!.href! }] : [];
  });

  return (
    <>
      {chips.length > 0 && (
        <ul aria-label="Active filters" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
          {chips.map((chip) => (
            <li key={chip.group}>
              <TagChip label={`${chip.group}: ${chip.label}`} onRemove={() => navigate(chip.reset)} />
            </li>
          ))}
        </ul>
      )}

      <TaskPanel
        addTo={editable ? { spaceId, listId: shownList?.id } : undefined}
        columnActions={columns.actions}
        columns={columns.columns}
        completed={completed && view === 'list'}
        creating={creating}
        editable={editableTask}
        failed={failed ?? (lists.error ? lists : undefined)}
        link={link}
        linkedTask={linked ? params.get('task') : null}
        onCloseLinked={closeLinked}
        onClosed={() => setCreating(false)}
        onCreate={() => setCreating(true)}
        onListsChanged={lists.reload}
        page={page}
        query={taskFilterQuery(state)}
        ready={ready && Boolean(lists.data)}
        shape={shape}
        tasksPath={tasksPath}
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
                  const created = await auth.request<TaskList>(homePath(spaceId, 'lists'), { method: 'POST', body: JSON.stringify({ title }) });
                  lists.mutate((current) => [...current, created]);
                  navigate(link({ list: created.id, view: null, completed: false, page: 1 }));
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
