import MuiDialog from '@mui/material/Dialog';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { lazy, Suspense, useId, useState, type ReactNode } from 'react';
import { Badge, Checkbox, ConfirmDialog, formatDay, Icon, TagChip, type IconName } from '@project-graphite/ui';
import { IconButton } from './IconButton';
import { useAuth } from '../auth';
import { priorityNames, quickSuggestions, withSuggestion } from '../quick-add';
import { homePath, useAllSpaces, type Member, type Tag } from '../spaces';
import { descriptionText, hasInput, newTaskDraft, plainDescription, withQuickTitle, type TaskComposer, type TaskDraft } from '../task-draft';
import { builtInTaskTypes, taskStatuses, taskTypeLabel, type Task, type TaskDetail, type TaskFilterChoices } from '../tasks';
import { clockTime } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ExpandGlyph } from './glyphs';
import type { OpenTaskProps } from './OpenTask';
import { Button } from './Button';
import { UserAvatar } from './UserAvatar';
import { Tip } from './Tip';

const TaskSheet = lazy(() => import('./TaskSheet'));

const composers: { value: TaskComposer; label: string; icon: ReactNode }[] = [
  { value: 'condensed', label: 'Quick dialog', icon: <Icon name="list" size={18} /> },
  { value: 'modal', label: 'Full dialog', icon: <ExpandGlyph /> },
  { value: 'panel', label: 'Side panel', icon: <Icon name="panel" size={18} /> },
];

export function ComposerMenu({ onChoose, value }: { onChoose: (composer: TaskComposer) => void; value: TaskComposer }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton aria-expanded={Boolean(anchor)} aria-haspopup="menu" icon="monitor" label="How to show a new task" onClick={(event) => setAnchor(event.currentTarget)} />
      <MuiMenu anchorEl={anchor} onClose={() => setAnchor(null)} open={Boolean(anchor)} slotProps={{ list: { 'aria-label': 'How to show a new task', className: 'composer-menu' } }}>
        {composers.map((composer) => (
          <Tip key={composer.value} placement="right" title={composer.label}>
            <MenuItem
              aria-checked={composer.value === value}
              aria-label={composer.label}
              onClick={() => {
                setAnchor(null);
                onChoose(composer.value);
              }}
              role="menuitemradio"
              selected={composer.value === value}
            >
              {composer.icon}
            </MenuItem>
          </Tip>
        ))}
      </MuiMenu>
    </>
  );
}

function ChipSelect<T extends string>({ icon, label, onChange, options, value }: { icon: IconName; label: string; onChange: (value: T) => void; options: { value: T; label: string; leading?: ReactNode }[]; value: T }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const chosen = options.find((option) => option.value === value);
  return (
    <>
      <button aria-expanded={Boolean(anchor)} aria-haspopup="listbox" aria-label={`${label}: ${chosen?.label ?? 'none'}`} className="chip-select" onClick={(event) => setAnchor(event.currentTarget)} title={label} type="button">
        {chosen?.leading ?? <Icon name={icon} size={14} />}
        <span className="truncate">{chosen?.label ?? label}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      <MuiMenu anchorEl={anchor} onClose={() => setAnchor(null)} open={Boolean(anchor)} slotProps={{ list: { 'aria-label': label, role: 'listbox' } }}>
        {options.map((option) => (
          <MenuItem
            aria-selected={option.value === value}
            key={option.value}
            onClick={() => {
              setAnchor(null);
              onChange(option.value);
            }}
            role="option"
            selected={option.value === value}
          >
            {option.leading && <span className="me-2 inline-flex">{option.leading}</span>}
            {option.label}
          </MenuItem>
        ))}
      </MuiMenu>
    </>
  );
}

function QuickTaskDialog({
  draft,
  onChoose,
  onClose,
  onCreated,
  setDraft,
  spaceId,
}: {
  draft: TaskDraft;
  onChoose: (composer: TaskComposer) => void;
  onClose: () => void;
  onCreated: (task: Task) => void;
  setDraft: (change: (draft: TaskDraft) => TaskDraft) => void;
  spaceId: string | null;
}) {
  const auth = useAuth();
  const adding = useAction();
  const titleId = useId();
  const hintId = useId();
  const suggestionsId = useId();
  const [another, setAnother] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const tags = useResource<Tag[]>(homePath(spaceId, 'tags'), true);
  const choices = useResource<TaskFilterChoices>(`/me/task-filters?${spaceId ? `spaceId=${spaceId}` : 'home=account'}`, true);
  const spaceMembers = useResource<Member[]>(spaceId ? `/spaces/${spaceId}/members` : null, true);
  const members = spaceId ? (spaceMembers.data ?? []) : auth.user ? [{ userId: auth.user.id, handle: auth.user.handle, displayName: auth.user.displayName }] : [];
  const known = (tags.data ?? []).map((tag) => tag.name);
  const parsed = withQuickTitle(draft, tags.data ?? []);
  const suggestions = dismissed === draft.title ? [] : quickSuggestions(draft.title, known);
  const highlighted = Math.min(active, suggestions.length - 1);
  const understood = parsed.dueDate !== draft.dueDate || parsed.priority !== draft.priority || parsed.labels.length > draft.labels.length;
  const close = () => (hasInput(draft) ? setLeaving(true) : onClose());

  function create() {
    if (!parsed.title.trim() || adding.busy) return;
    const { labels, ...fields } = parsed;
    void adding.run(async () => {
      const saved = await auth.request<TaskDetail>(homePath(spaceId, 'tasks'), { method: 'POST', body: JSON.stringify({ ...fields, title: fields.title.trim().slice(0, 200) }) });
      if (labels.length) await auth.request(`/items/${saved.id}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds: labels.map((tag) => tag.id) }) });
      onCreated({ ...saved, labels });
      if (another) setDraft((current) => ({ ...current, title: '', description: null, labels: [] }));
      else onClose();
      return `Added ${saved.title}.`;
    }, 'Could not add the task');
  }

  const submitOnEnter = (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    create();
  };

  return (
    <MuiDialog aria-labelledby={titleId} fullWidth maxWidth="sm" onClose={close} open slotProps={{ paper: { className: 'sheet-paper task-quick' } }}>
      <div className="sheet-head">
        <h2 className="m-0 text-h3" id={titleId}>
          New task
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <ComposerMenu onChoose={onChoose} value="condensed" />
          <IconButton icon="x" label="Close" onClick={close} />
        </div>
      </div>
      <div className="task-quick-body">
        <div className="relative">
          <input
            aria-activedescendant={suggestions.length ? `${suggestionsId}-${highlighted}` : undefined}
            aria-autocomplete="list"
            aria-controls={suggestions.length ? suggestionsId : undefined}
            aria-describedby={understood ? hintId : undefined}
            aria-expanded={suggestions.length > 0}
            aria-label="Task title"
            autoComplete="off"
            autoFocus
            className="task-quick-title"
            maxLength={300}
            onBlur={() => setDismissed(draft.title)}
            onChange={(event) => {
              const title = event.currentTarget.value;
              setDraft((current) => ({ ...current, title }));
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (suggestions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault();
                setActive((highlighted + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
              } else if (suggestions.length && (event.key === 'Enter' || event.key === 'Tab')) {
                event.preventDefault();
                const title = withSuggestion(draft.title, suggestions[highlighted]!);
                setDraft((current) => ({ ...current, title }));
                setActive(0);
              } else if (suggestions.length && event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDismissed(draft.title);
              } else submitOnEnter(event);
            }}
            placeholder="Task title, like “Call Sam tomorrow #home !3”"
            role="combobox"
            type="text"
            value={draft.title}
          />
          {suggestions.length > 0 && (
            <ul className="quick-suggestions" id={suggestionsId} role="listbox">
              {suggestions.map((suggestion, index) => (
                <li
                  aria-selected={index === highlighted}
                  className="quick-suggestion"
                  id={`${suggestionsId}-${index}`}
                  key={suggestion.insert}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    const title = withSuggestion(draft.title, suggestion);
                    setDraft((current) => ({ ...current, title }));
                  }}
                  role="option"
                >
                  <span className="min-w-0 truncate text-ink">{suggestion.label}</span>
                  <span className="shrink-0 text-small text-muted">{suggestion.hint}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {understood && (
          <div aria-label="Understood" className="flex flex-wrap items-center gap-2" id={hintId} role="status">
            {parsed.dueDate && parsed.dueDate !== draft.dueDate && (
              <Badge icon="calendar">{`Due ${formatDay(parsed.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}${parsed.dueTime ? ` ${clockTime(parsed.dueTime)}` : ''}`}</Badge>
            )}
            {parsed.priority !== draft.priority && <Badge icon="alert">{`${priorityNames[parsed.priority]} priority`}</Badge>}
            {parsed.labels.slice(draft.labels.length).map((tag) => (
              <TagChip color={tag.color} key={tag.id} label={tag.name} />
            ))}
          </div>
        )}
        <textarea
          aria-label="Description"
          className="task-quick-description"
          maxLength={2000}
          onChange={(event) => {
            const description = plainDescription(event.currentTarget.value);
            setDraft((current) => ({ ...current, description }));
          }}
          onKeyDown={submitOnEnter}
          placeholder="Add a description"
          rows={3}
          value={descriptionText(draft.description)}
        />
        <div aria-label="Task details" className="flex flex-wrap items-center gap-2" role="group">
          <ChipSelect
            icon="tag"
            label="Type"
            onChange={(type) => setDraft((current) => ({ ...current, type }))}
            options={[...new Set([...builtInTaskTypes, ...(choices.data?.types ?? []), draft.type])].map((type) => ({ value: type, label: taskTypeLabel(type) }))}
            value={draft.type}
          />
          <ChipSelect
            icon="check"
            label="Status"
            onChange={(status) => setDraft((current) => ({ ...current, status }))}
            options={taskStatuses.map((status) => ({ value: status.value, label: status.label }))}
            value={draft.status}
          />
          <ChipSelect
            icon="user"
            label="Assignee"
            onChange={(assigneeId) => setDraft((current) => ({ ...current, assigneeId: assigneeId || null }))}
            options={[{ value: '', label: 'Nobody' }, ...members.map((member) => ({ value: member.userId, label: member.displayName, leading: <UserAvatar name={member.displayName} size="sm" userId={member.userId} /> }))]}
            value={draft.assigneeId ?? ''}
          />
        </div>
      </div>
      <div className="sheet-foot task-quick-foot">
        <Checkbox checked={another} label="Create another" onChange={(event) => setAnother(event.currentTarget.checked)} />
        <span className="flex-1" />
        <Button disabled={!parsed.title.trim() || adding.busy} label={adding.busy ? 'Adding…' : 'Add task'} large onClick={create} primary />
      </div>
      {leaving && (
        <ConfirmDialog confirmLabel="Discard" errorFallback="Could not close the task" onClose={() => setLeaving(false)} onConfirm={async () => onClose()} title="Discard this task?" tone="danger">
          What you typed is not saved.
        </ConfirmDialog>
      )}
    </MuiDialog>
  );
}

export function NewTask({ listId, onChanged, onClose, onCreated, spaceId: newIn, status }: OpenTaskProps) {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const remembering = useAction();
  const spaceId = newIn ?? null;
  const space = spaces.data?.find((candidate) => candidate.id === spaceId);
  const [composer, setComposer] = useState<TaskComposer>(() => (auth.user?.taskComposer as TaskComposer | undefined) ?? 'condensed');
  const [draft, setDraft] = useState(() => newTaskDraft({ defaults: space?.defaults?.task, listId, status, userId: auth.user?.id }));
  const created = (task: Task) => {
    onChanged(task);
    onCreated?.(task);
  };

  function choose(next: TaskComposer) {
    setComposer(next);
    if (next === auth.user?.taskComposer) return;
    auth.updateUser({ taskComposer: next });
    void remembering.run(async () => {
      await auth.request('/me', { method: 'PATCH', body: JSON.stringify({ taskComposer: next }) });
      return '';
    }, 'Could not remember how to show new tasks');
  }

  if (composer === 'condensed') return <QuickTaskDialog draft={draft} onChoose={choose} onClose={onClose} onCreated={created} setDraft={setDraft} spaceId={spaceId} />;
  return (
    <Suspense fallback={null}>
      <TaskSheet composer={composer} draft={draft} onChanged={onChanged} onChoose={choose} onClose={onClose} onCreated={onCreated} onDraft={setDraft} spaceId={spaceId} />
    </Suspense>
  );
}
