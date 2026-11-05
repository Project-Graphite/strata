import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ColorSwatches, ConfirmDialog, Icon, ListRow, Placeholder, SectionHeading, SegmentedControl, Select, TagChip, TextAreaField, TextField } from '@project-graphite/ui';
import { IconButton } from '../../components/IconButton';
import { useAuth } from '../../auth';
import { boardTemplates } from '../../components/board-templates';
import { IconPicker } from '../../components/IconPicker';
import { LoadError } from '../../components/LoadError';
import { SavedForm } from '../../components/SavedForm';
import { ButtonSkeleton, FieldSkeleton, RowsSkeleton } from '../../components/Skeletons';
import { useTaskColumns } from '../../components/TaskColumns';
import { Toggle } from '../../components/Toggle';
import { fileSize } from '../../files';
import { builtInTemplates, type Note } from '../../notes';
import { priorityNames } from '../../quick-add';
import { roleOptions, SpaceMark, spaceHref, useAllSpaces, type Member, type Space, type SpaceDefaults } from '../../spaces';
import { builtInTaskTypes, taskStatuses, taskTypeLabel, taskViews, type TaskFilterChoices, type TaskList, type TaskView } from '../../tasks';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SpaceInvitations } from './SpaceInvitations';
import { useSpace, useSpaceActions } from './SpaceLayout';

interface SpaceSettingsData {
  name: string;
  color: Space['color'];
  description: string;
  defaults: SpaceDefaults;
}

type Change = Partial<Pick<SpaceSettingsData, 'name' | 'color' | 'description'>> & { defaults?: { [Kind in keyof SpaceDefaults]?: Partial<SpaceDefaults[Kind]> } };

const groups = [
  ['general', 'General'],
  ['defaults', 'Defaults'],
  ['access', 'Members and access'],
  ['tasks', 'Tasks'],
  ['organising', 'Tags and Tidy'],
  ['storage', 'Storage'],
  ['danger', 'Danger zone'],
] as const;

const linkLengths = [
  { value: '1', label: '1 day' },
  { value: '7', label: '1 week' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never expire' },
];

function Panel({ children, description, id, title }: { children: ReactNode; description?: ReactNode; id: (typeof groups)[number][0]; title: string }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="settings-panel" id={id}>
      <div id={`${id}-heading`}>
        <SectionHeading description={description} level={2} title={title} />
      </div>
      {children}
    </section>
  );
}

function General({ current, save }: { current: SpaceSettingsData; save: (change: Change) => Promise<unknown> }) {
  const initial = { name: current.name, color: current.color, description: current.description };
  const [values, setValues] = useState(initial);
  const nameProblem = values.name.trim() ? undefined : 'Enter a name.';
  return (
    <SavedForm
      initial={initial}
      invalid={Boolean(nameProblem)}
      label="General settings"
      onSave={() => save({ name: values.name.trim(), color: values.color, description: values.description.trim() })}
      values={values}
    >
      <div className="settings-grid">
        <div className="settings-row">
          <span aria-hidden="true" className="pt-7">
            <SpaceMark large space={{ ...current, ...values }} />
          </span>
          <div className="field-short">
            <TextField error={nameProblem} label="Name" maxLength={60} onChange={(event) => setValues({ ...values, name: event.currentTarget.value })} value={values.name} />
          </div>
          <ColorSwatches label="Colour" name="color" onChange={(color) => setValues({ ...values, color })} value={values.color} />
        </div>
        <div className="field-long">
          <TextAreaField label="Description" maxLength={280} onChange={(event) => setValues({ ...values, description: event.currentTarget.value })} rows={3} value={values.description} />
        </div>
      </div>
    </SavedForm>
  );
}

function Defaults({ current, lists, save, space, templates }: { current: SpaceDefaults; lists: TaskList[]; save: (change: Change) => Promise<unknown>; space: Space; templates: Note[] }) {
  const choices = useResource<TaskFilterChoices>(`/me/task-filters?spaceId=${space.id}`, true);
  const [values, setValues] = useState(current);
  const page = (change: Partial<SpaceDefaults['page']>) => setValues({ ...values, page: { ...values.page, ...change } });
  const board = (change: Partial<SpaceDefaults['board']>) => setValues({ ...values, board: { ...values.board, ...change } });
  const task = (change: Partial<SpaceDefaults['task']>) => setValues({ ...values, task: { ...values.task, ...change } });
  const types = [...new Set([...builtInTaskTypes, ...(choices.data?.types ?? []), values.task.type])];
  return (
    <SavedForm initial={current} label="Defaults" onSave={() => save({ defaults: { page: values.page, board: values.board, task: values.task } })} values={values}>
      <div className="settings-columns">
        <fieldset className="settings-card">
          <legend>New pages</legend>
          <Select
            label="Template"
            onChange={(template) => page({ template: template || null })}
            options={[{ value: '', label: 'Blank page' }, ...builtInTemplates.map(([value, label]) => ({ value, label })), ...templates.map((note) => ({ value: note.id, label: note.title || 'Untitled template' }))]}
            value={values.page.template ?? ''}
          />
          <div className="flex items-center gap-3">
            <IconPicker icon={values.page.icon} onPick={(icon) => page({ icon })} />
            <span className="text-small text-muted">Icon</span>
          </div>
          <div className="panel-rows">
            <Toggle checked={values.page.narrow} description="New pages start in the narrow reading width." label="Narrow reading width" onChange={(narrow) => page({ narrow })} />
          </div>
        </fieldset>
        <fieldset className="settings-card">
          <legend>New boards</legend>
          <Select
            label="Template"
            onChange={(template) => board({ template: template || null })}
            options={[{ value: '', label: 'Blank board' }, ...boardTemplates.map((template) => ({ value: template.id, label: template.label }))]}
            value={values.board.template ?? ''}
          />
          <div className="flex items-center gap-3">
            <IconPicker icon={values.board.icon} onPick={(icon) => board({ icon })} />
            <span className="text-small text-muted">Icon</span>
          </div>
        </fieldset>
        <fieldset className="settings-card">
          <legend>New tasks</legend>
          <Select label="Type" onChange={(type) => task({ type })} options={types.map((type) => ({ value: type, label: taskTypeLabel(type) }))} value={values.task.type} />
          <Select label="Priority" onChange={(priority) => task({ priority: Number(priority) })} options={priorityNames.map((label, priority) => ({ value: String(priority), label }))} value={String(values.task.priority)} />
          <Select label="Assigned to" onChange={(assignee) => task({ assignee })} options={[{ value: 'creator', label: 'Whoever adds the task' }, { value: 'none', label: 'Nobody' }]} value={values.task.assignee} />
          <Select label="Epic" onChange={(listId) => task({ listId: listId || null })} options={[{ value: '', label: 'No epic' }, ...lists.map((list) => ({ value: list.id, label: list.title }))]} value={values.task.listId ?? ''} />
          <Select label="Status" onChange={(status) => task({ status })} options={taskStatuses.filter((status) => status.value !== 'done').map((status) => ({ value: status.value, label: status.label }))} value={values.task.status} />
        </fieldset>
        <fieldset className="settings-card">
          <legend>New epics</legend>
          <SegmentedControl label="Show tasks as" onChange={(view: TaskView) => task({ view })} options={taskViews} value={values.task.view} />
          <p className="m-0 text-small text-muted">Each epic keeps its own view once it is changed.</p>
        </fieldset>
      </div>
    </SavedForm>
  );
}

function Access({ current, save }: { current: SpaceDefaults['access']; save: (change: Change) => Promise<unknown> }) {
  const [values, setValues] = useState(current);
  return (
    <SavedForm initial={current} label="Members and access" onSave={() => save({ defaults: { access: values } })} values={values}>
      <div className="settings-columns">
        <Select label="New invites join as" onChange={(inviteRole) => setValues({ ...values, inviteRole: inviteRole === 'viewer' ? 'viewer' : 'editor' })} options={roleOptions.filter((role) => role.value !== 'owner')} value={values.inviteRole} />
        <Select label="Who can invite people" onChange={(inviters) => setValues({ ...values, inviters })} options={[{ value: 'owners', label: 'Owners' }, { value: 'editors', label: 'Owners and editors' }]} value={values.inviters} />
        <Select label="Who can make share links" onChange={(sharers) => setValues({ ...values, sharers })} options={[{ value: 'editors', label: 'Owners and editors' }, { value: 'owners', label: 'Owners' }]} value={values.sharers} />
        <Select label="Share links last" onChange={(days) => setValues({ ...values, linkDays: days === 'never' ? null : Number(days) })} options={linkLengths} value={values.linkDays === null ? 'never' : String(values.linkDays)} />
      </div>
    </SavedForm>
  );
}

function EpicSettings({ list, space }: { list: { id: string | null; title: string; view: TaskView | null }; space: Space }) {
  const auth = useAuth();
  const action = useAction();
  const columns = useTaskColumns(space.id, list.id ?? 'none', true);
  const [view, setView] = useState<TaskView>(list.view ?? space.defaults?.task.view ?? 'board');
  return (
    <li className="settings-card">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-ink" title={list.title}>
          {list.title}
        </span>
        {list.id && (
          <SegmentedControl
            label={`Show ${list.title} as`}
            onChange={(next: TaskView) => {
              const before = view;
              setView(next);
              void action
                .run(async () => {
                  await auth.request(`/lists/${list.id}/view`, { method: 'PUT', body: JSON.stringify({ view: next }) });
                  return `${list.title} shows as a ${next} now.`;
                }, 'Could not change how the epic shows')
                .then((saved) => saved || setView(before));
            }}
            options={taskViews}
            size="small"
            value={view}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-muted">In progress</span>
        {columns.columns.map((column) => (
          <span className="inline-flex items-center" key={column.id}>
            <TagChip label={column.name} />
            <IconButton icon="pencil" label={`Rename the ${column.name} column`} onClick={() => columns.rename(column)} />
            <IconButton icon="trash" label={`Remove the ${column.name} column`} onClick={() => columns.remove(column)} />
          </span>
        ))}
        {columns.add && <IconButton icon="plus" label={`Add a column to ${list.title}`} onClick={columns.add} />}
        <span className="text-small text-muted">Done</span>
      </div>
      {columns.dialogs}
    </li>
  );
}

function Danger({ members, space }: { members: Member[]; space: Space }) {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const actions = useSpaceActions();
  const { report } = useAction();
  const [heir, setHeir] = useState('');
  const [confirming, setConfirming] = useState<'transfer' | 'archive'>();
  const others = members.filter((member) => member.userId !== auth.user?.id);
  const chosen = others.find((member) => member.userId === heir);
  const replace = (next: Partial<Space>) => spaces.mutate((list) => list.map((shown) => (shown.id === space.id ? { ...shown, ...next } : shown)));

  return (
    <ul className="panel-rows">
      <ListRow
        meta="Make another member the owner. You stay on as an editor."
        title="Hand over the space"
        trail={
          <span className="flex items-center gap-2">
            <Select aria-label="New owner" onChange={setHeir} options={others.map((member) => ({ value: member.userId, label: member.displayName }))} placeholder={others.length ? 'Choose a member' : 'Nobody else is here'} size="small" value={heir} />
            <IconButton disabled={!chosen} icon="users" label="Hand over the space" onClick={() => setConfirming('transfer')} />
          </span>
        }
      />
      <ListRow
        meta={space.archived ? 'It is hidden from the sidebar. Bring it back to show it again.' : 'Hide it from everyone’s sidebar. Everything in it stays, and you can bring it back.'}
        title={space.archived ? 'Archived' : 'Archive the space'}
        trail={<IconButton icon={space.archived ? 'undo' : 'library'} label={space.archived ? 'Bring the space back' : 'Archive the space'} onClick={() => setConfirming('archive')} />}
      />
      <ListRow meta="You lose access until someone invites you back." title="Leave the space" trail={<IconButton icon="x" label="Leave the space" onClick={() => actions.open('leave', space)} />} />
      <ListRow meta="Everything in it is deleted for every member, and this can’t be undone." title="Delete the space" trail={<IconButton icon="trash" label="Delete the space" onClick={() => actions.open('delete', space)} />} />
      {actions.dialog}
      {confirming === 'transfer' && chosen && (
        <ConfirmDialog
          busyLabel="Handing over…"
          confirmLabel="Hand over"
          errorFallback="Could not hand over the space"
          onClose={() => setConfirming(undefined)}
          onConfirm={async () => {
            await auth.request(`/spaces/${space.id}/transfer`, { method: 'POST', body: JSON.stringify({ userId: chosen.userId }) });
            replace({ role: 'editor' });
            report(`${chosen.displayName} owns ${space.name} now.`);
          }}
          title={`Hand ${space.name} to ${chosen.displayName}?`}
          tone="danger"
        >
          They become the owner and you become an editor. Only an owner can change that back.
        </ConfirmDialog>
      )}
      {confirming === 'archive' && (
        <ConfirmDialog
          busyLabel={space.archived ? 'Bringing back…' : 'Archiving…'}
          confirmLabel={space.archived ? 'Bring back' : 'Archive'}
          errorFallback={space.archived ? 'Could not bring the space back' : 'Could not archive the space'}
          onClose={() => setConfirming(undefined)}
          onConfirm={async () => {
            const next = await auth.request<Space>(`/spaces/${space.id}/archive`, { method: space.archived ? 'DELETE' : 'PUT' });
            replace({ archived: next.archived });
            report(next.archived ? `Archived ${space.name}.` : `Brought back ${space.name}.`);
          }}
          title={space.archived ? `Bring back ${space.name}?` : `Archive ${space.name}?`}
        >
          {space.archived ? 'It shows in everyone’s sidebar again.' : 'It leaves everyone’s sidebar. Members can still open it from Spaces.'}
        </ConfirmDialog>
      )}
    </ul>
  );
}

export function SpaceSettings() {
  const auth = useAuth();
  const space = useSpace();
  const spaces = useAllSpaces();
  const settings = useResource<SpaceSettingsData>(`/spaces/${space.id}/settings`, true);
  const lists = useResource<TaskList[]>(`/spaces/${space.id}/lists`, true, { live: ['tasks'] });
  const notes = useResource<Note[]>(`/spaces/${space.id}/notes`, true);
  const members = useResource<Member[]>(`/spaces/${space.id}/members`, true);
  const storage = useResource<{ files: number; sizeBytes: number }>(`/spaces/${space.id}/storage`, true, { live: ['items'] });
  const choices = useResource<TaskFilterChoices>(`/me/task-filters?spaceId=${space.id}`, true, { live: ['tasks'] });

  const save = async (change: Change) => {
    const next = await auth.request<SpaceSettingsData>(`/spaces/${space.id}/settings`, { method: 'PATCH', body: JSON.stringify(change) });
    settings.mutate(() => next);
    spaces.mutate((list) => list.map((shown) => (shown.id === space.id ? { ...shown, name: next.name, color: next.color, description: next.description, defaults: next.defaults } : shown)));
  };

  const failed = [settings, lists].find((resource) => resource.error);
  if (failed) return <LoadError error={failed.error} onRetry={failed.reload} />;

  return (
    <div className="settings-layout">
      <nav aria-label="Space settings" className="settings-nav">
        <ul>
          {groups.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="settings-panels">
        {!settings.data || !lists.data ? (
          <Placeholder className="grid gap-8" label="Loading the space settings">
            <div className="settings-columns">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <ButtonSkeleton width="w-32" />
          </Placeholder>
        ) : (
          <>
            <Panel id="general" title="General">
              <General current={settings.data} key={JSON.stringify([settings.data.name, settings.data.color, settings.data.description])} save={save} />
            </Panel>
            <Panel description="What new pages, boards, tasks and epics start with in this space." id="defaults" title="Defaults">
              <Defaults current={settings.data.defaults} key={JSON.stringify(settings.data.defaults)} lists={lists.data} save={save} space={space} templates={(notes.data ?? []).filter((note) => note.template)} />
            </Panel>
            <Panel id="access" title="Members and access">
              <Access current={settings.data.defaults.access} key={JSON.stringify(settings.data.defaults.access)} save={save} />
              <SpaceInvitations space={space} />
              <Link className="text-small" to={spaceHref(space, 'members')}>
                Manage members
              </Link>
            </Panel>
            <Panel description="Columns sit between In progress and Done. Each epic has its own." id="tasks" title="Tasks">
              <ul className="settings-columns m-0 list-none p-0">
                {[{ id: null, title: 'Tasks without an epic', view: null }, ...lists.data].map((list) => (
                  <EpicSettings key={list.id ?? 'none'} list={list} space={space} />
                ))}
              </ul>
              <div className="grid gap-2">
                <h3 className="m-0 text-small text-muted">Task types in use</h3>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...builtInTaskTypes, ...(choices.data?.types ?? [])])].map((type) => (
                    <TagChip key={type} label={taskTypeLabel(type)} />
                  ))}
                </div>
              </div>
            </Panel>
            <Panel id="organising" title="Tags and Tidy">
              <ul className="panel-rows">
                <ListRow href={spaceHref(space, 'tags')} lead={<Icon name="tag" size={18} />} meta="Labels for pages, tasks and files in this space." title="Tags" />
                {auth.user?.features.includes('tidy') && <ListRow href={spaceHref(space, 'tags')} lead={<Icon name="sparkles" size={18} />} meta="Rules that file and tag uploads in this space." title="Tidy rules" />}
              </ul>
            </Panel>
            <Panel id="storage" title="Storage">
              {storage.error ? (
                <LoadError compact error={storage.error} onRetry={storage.reload} />
              ) : !storage.data ? (
                <RowsSkeleton rows={1} />
              ) : (
                <ul className="panel-rows">
                  <ListRow
                    href={`/files?space=${space.id}`}
                    lead={<Icon name="library" size={18} />}
                    meta={`${storage.data.files} file${storage.data.files === 1 ? '' : 's'} · ${fileSize(storage.data.sizeBytes)}`}
                    title="Files in this space"
                  />
                </ul>
              )}
            </Panel>
            <Panel id="danger" title="Danger zone">
              {members.error ? <LoadError compact error={members.error} onRetry={members.reload} /> : <Danger members={members.data ?? []} space={space} />}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
