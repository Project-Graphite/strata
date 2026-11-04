import { useEffect, useState } from 'react';
import { ConfirmDialog, DatePicker, LinesSkeleton, Select, Sheet, TagChip, TextField, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { priorityNames } from '../quick-add';
import { useAllSpaces, type Member, type Tag } from '../spaces';
import { builtInTaskTypes, reminderOptions, repeatOptions, taskStatuses, taskTypeLabel, useWeekStart, type Task, type TaskDetail, type TaskFilterChoices, type TaskList } from '../tasks';
import { TimeField, zoneLabel } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ActionsMenu } from './ActionsMenu';
import { Button, TextButton } from './Button';
import { CommentsButton, CommentsPanel } from './CommentsPanel';
import type { OpenTaskProps } from './OpenTask';
import { Activity, Attachments, Comments, DescriptionEditor, Relations, Subtasks } from './TaskTicket';

interface Fields {
  title: string;
  status: Task['status'];
  type: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: number;
  listId: string | null;
  assigneeId: string | null;
  repeatRule: string | null;
  reminderMinutes: number | null;
  description: Record<string, unknown> | null;
}

const priorityOptions = priorityNames.map((label, value) => ({ value: String(value), label }));

const fieldsOf = (task: TaskDetail): Fields => ({
  title: task.title,
  status: task.status,
  type: task.type,
  dueDate: task.dueDate,
  dueTime: task.dueTime,
  priority: task.priority,
  listId: task.listId,
  assigneeId: task.assignee?.id ?? null,
  repeatRule: task.repeatRule,
  reminderMinutes: task.reminderMinutes,
  description: task.description,
});

function applied(task: TaskDetail, { assigneeId, ...change }: Partial<Fields>, members: Member[]): TaskDetail {
  const member = members.find((candidate) => candidate.userId === assigneeId);
  return {
    ...task,
    ...change,
    ...(assigneeId === undefined ? {} : { assignee: member ? { id: member.userId, handle: '', displayName: member.displayName } : null }),
    ...(change.status ? { completedAt: change.status === 'done' ? (task.completedAt ?? new Date().toISOString()) : null } : {}),
  };
}

export default function TaskSheet({ listId, onChanged, onClose, onCreated, spaceId: newIn, status, task: given, taskId }: OpenTaskProps) {
  const auth = useAuth();
  const show = useSnackbar();
  const action = useAction();
  const spaces = useAllSpaces();
  const weekStart = useWeekStart();
  const [id, setId] = useState(given?.id ?? taskId);
  const [title, setTitle] = useState<string>();
  const [descriptionChanged, setDescriptionChanged] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState(0);
  const [draft, setDraft] = useState<Fields & { labels: Tag[] }>(() => ({
    title: '',
    status: status ?? 'open',
    type: 'task',
    dueDate: null,
    dueTime: null,
    priority: 0,
    listId: listId ?? null,
    assigneeId: auth.user?.id ?? null,
    repeatRule: null,
    reminderMinutes: null,
    description: null,
    labels: [],
  }));
  const detail = useResource<TaskDetail>(id ? `/tasks/${id}` : null, true, id ? { live: ['tasks', 'task-details'], itemIds: [id] } : undefined);
  const task = id ? detail.data : undefined;
  const heading = task ?? (given?.id === id ? given : undefined);
  const spaceId = heading?.spaceId ?? newIn;
  const space = spaces.data?.find((candidate) => candidate.id === spaceId);
  const lists = useResource<TaskList[]>(spaceId ? `/spaces/${spaceId}/lists` : null, true);
  const members = useResource<Member[]>(spaceId ? `/spaces/${spaceId}/members` : null, true);
  const tags = useResource<Tag[]>(spaceId ? `/spaces/${spaceId}/tags` : null, true);
  const choices = useResource<TaskFilterChoices>(spaceId ? `/me/task-filters?spaceId=${spaceId}` : null, true);
  const [namingType, setNamingType] = useState(false);
  const editable = Boolean(space && space.role !== 'viewer');
  const values = task ? fieldsOf(task) : draft;
  const labels = task ? task.labels : draft.labels;
  const zone = zoneLabel(task?.timeZone ?? auth.user?.timeZone ?? 'UTC');
  const missing = detail.error;

  useEffect(() => {
    if (!missing) return;
    show({ message: detail.status === 404 ? 'That task is no longer here. It may have been deleted.' : missing, tone: 'error' });
    onClose();
  }, [detail.status, missing, onClose, show]);

  function save(change: Partial<Fields>) {
    if (!task) {
      setDraft((current) => ({ ...current, ...change }));
      return;
    }
    const before = task;
    detail.mutate((current) => applied(current, change, members.data ?? []));
    void action.run(async () => {
      try {
        const saved = await auth.request<TaskDetail>(`/tasks/${before.id}`, { method: 'PATCH', body: JSON.stringify(change) });
        detail.mutate(() => saved);
        onChanged(saved);
        return '';
      } catch (reason) {
        detail.mutate(() => before);
        throw reason;
      }
    }, 'Could not save the task');
  }

  function saveLabels(next: Tag[]) {
    if (!task) {
      setDraft((current) => ({ ...current, labels: next }));
      return;
    }
    const before = task;
    detail.mutate((current) => ({ ...current, labels: next }));
    void action.run(async () => {
      try {
        await auth.request(`/items/${before.id}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds: next.map((tag) => tag.id) }) });
        onChanged({ ...before, labels: next });
        return '';
      } catch (reason) {
        detail.mutate(() => before);
        throw reason;
      }
    }, 'Could not change the labels');
  }

  function create() {
    if (!draft.title.trim() || !newIn) return;
    const { labels: chosen, ...fields } = draft;
    void action.run(async () => {
      const saved = await auth.request<TaskDetail>(`/spaces/${newIn}/tasks`, { method: 'POST', body: JSON.stringify({ ...fields, title: fields.title.trim() }) });
      if (chosen.length) await auth.request(`/items/${saved.id}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds: chosen.map((tag) => tag.id) }) });
      const added = { ...saved, labels: chosen };
      onChanged(added);
      onCreated?.(added);
      onClose();
      return `Added ${added.title}.`;
    }, 'Could not add the task');
  }

  return (
    <>
      <Sheet
        actions={
          task && (
            <>
              <CommentsButton count={comments} onClick={() => setCommentsOpen(!commentsOpen)} open={commentsOpen} />
              {editable && (
            <ActionsMenu
              items={[
                {
                  label: 'Move to trash',
                  separated: true,
                  onSelect: () =>
                    void action
                      .run(async () => {
                        await auth.request(`/items/${task.id}/trash`, { method: 'POST' });
                        onChanged();
                        return {
                          message: `Moved ${task.title} to the trash.`,
                          undo: async () => {
                            await auth.request(`/items/${task.id}/restore`, { method: 'POST' });
                            onChanged();
                            return '';
                          },
                        };
                      }, 'Could not move the task to the trash')
                      .then((trashed) => trashed && onClose()),
                },
              ]}
              name={task.title}
            />
              )}
            </>
          )
        }
        eyebrow={task?.parentId && <TextButton icon="chevron-left" label="Parent task" onClick={() => setId(task.parentId!)} />}
        footer={
          !id && (
            <>
              <Button label="Cancel" large onClick={onClose} />
              <Button disabled={!draft.title.trim() || !editable || action.busy} label={action.busy ? 'Adding…' : 'Add task'} large onClick={create} primary />
            </>
          )
        }
        onClose={descriptionChanged ? () => setLeaving(true) : onClose}
        title={id ? (heading?.title ?? 'Task') : 'New task'}
        width="56rem"
      >
        {id && !task ? (
          <LinesSkeleton label="Loading the task" lines={6} />
        ) : (
          <div className="task-sheet-layout grid gap-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!task) return create();
                (event.currentTarget.elements.namedItem('title') as HTMLInputElement | null)?.blur();
              }}
            >
              <TextField
                autoFocus={!id}
                disabled={!editable}
                label="Title"
                maxLength={200}
                name="title"
                onBlur={() => {
                  if (!task || title === undefined) return;
                  if (title.trim() && title.trim() !== task.title) save({ title: title.trim() });
                  setTitle(undefined);
                }}
                onChange={(event) => (task ? setTitle(event.currentTarget.value) : save({ title: event.currentTarget.value }))}
                value={title ?? values.title}
              />
            </form>
            <div className="task-sheet">
              <div className="grid min-w-0 content-start gap-8">
                <DescriptionEditor editable={editable} key={id ?? 'new'} onDirty={setDescriptionChanged} onSave={(description) => save({ description })} staged={Boolean(task)} value={values.description} />
                {task && (
                  <>
                    {!task.parentId && (
                      <Subtasks
                        editable={editable}
                        onChanged={() => onChanged()}
                        onOpen={(subtask) => {
                          setTitle(undefined);
                          setId(subtask.id);
                        }}
                        task={task}
                        update={(change) => detail.mutate(change)}
                      />
                    )}
                    <Relations editable={editable} onOpen={setId} taskId={task.id} />
                    <Attachments editable={editable} taskId={task.id} />
                    <details className="task-activity" onToggle={(event) => setActivityOpen(event.currentTarget.open)}>
                      <summary className="text-h3 text-ink">Activity</summary>
                      {activityOpen && <Activity taskId={task.id} />}
                    </details>
                  </>
                )}
              </div>
              <aside aria-label="Properties" className="task-properties">
                <Select disabled={!editable} label="Status" onChange={(status) => save({ status })} options={[...taskStatuses]} value={values.status} />
                {namingType ? (
                  <TextField
                    autoFocus
                    label="New type"
                    maxLength={30}
                    onBlur={(event) => {
                      const name = event.currentTarget.value.trim();
                      if (name) save({ type: name });
                      setNamingType(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') event.currentTarget.value = '';
                      if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                    }}
                  />
                ) : (
                  <Select
                    disabled={!editable}
                    label="Type"
                    onChange={(chosen) => (chosen ? save({ type: chosen }) : setNamingType(true))}
                    options={[
                      ...[...new Set([...builtInTaskTypes, ...(choices.data?.types ?? []), values.type])].map((type) => ({ value: type, label: taskTypeLabel(type) })),
                      { value: '', label: 'New type…' },
                    ]}
                    value={values.type}
                  />
                )}
                <DatePicker
                  disabled={!editable}
                  label="Due date"
                  onChange={(dueDate) => save(dueDate ? { dueDate } : { dueDate: null, dueTime: null, repeatRule: null })}
                  value={values.dueDate ?? ''}
                  weekStartsOn={weekStart ?? 0}
                />
                <TimeField disabled={!editable || !values.dueDate} label="Time" onChange={(dueTime) => save({ dueTime: dueTime || null })} value={values.dueTime ?? ''} />
                <Select disabled={!editable} label="Priority" onChange={(priority) => save({ priority: Number(priority) })} options={priorityOptions} value={String(values.priority)} />
                <Select
                  disabled={!editable}
                  label="List"
                  onChange={(chosen) => save({ listId: chosen || null })}
                  options={[{ value: '', label: 'No list' }, ...(lists.data ?? []).map((list) => ({ value: list.id, label: list.title }))]}
                  value={values.listId ?? ''}
                />
                <Select
                  disabled={!editable}
                  label="Assigned to"
                  onChange={(chosen) => save({ assigneeId: chosen || null })}
                  options={[{ value: '', label: 'Nobody' }, ...(members.data ?? []).map((member) => ({ value: member.userId, label: member.displayName }))]}
                  value={values.assigneeId ?? ''}
                />
                <Select
                  disabled={!editable || !values.dueDate}
                  label="Repeats"
                  onChange={(rule) => save({ repeatRule: rule || null })}
                  options={repeatOptions(values.repeatRule)}
                  value={values.repeatRule ?? ''}
                />
                <Select
                  disabled={!editable}
                  label="Reminder"
                  onChange={(minutes) => save({ reminderMinutes: minutes === '' ? null : Number(minutes) })}
                  options={reminderOptions(values.reminderMinutes)}
                  value={values.reminderMinutes == null ? '' : String(values.reminderMinutes)}
                />
                <div className="task-labels">
                  <Select
                    disabled={!editable || !tags.data?.some((tag) => !labels.some((label) => label.id === tag.id))}
                    label="Labels"
                    onChange={(tagId) => {
                      const tag = tags.data?.find((candidate) => candidate.id === tagId);
                      if (tag) saveLabels([...labels, tag]);
                    }}
                    options={(tags.data ?? []).filter((tag) => !labels.some((label) => label.id === tag.id)).map((tag) => ({ value: tag.id, label: tag.name }))}
                    placeholder={tags.data?.length ? 'Add a label' : 'No labels in this space'}
                    value=""
                  />
                  {labels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {labels.map((label) => (
                        <TagChip color={label.color} key={label.id} label={label.name} onRemove={editable ? () => saveLabels(labels.filter((kept) => kept.id !== label.id)) : undefined} />
                      ))}
                    </div>
                  )}
                </div>
                {zone && <p className="task-labels m-0 text-small text-muted">Times are in {zone}.</p>}
              </aside>
            </div>
            {task && (
              <CommentsPanel onClose={() => setCommentsOpen(false)} open={commentsOpen}>
                <Comments editable={editable} key={task.id} onCount={setComments} owner={space?.role === 'owner'} taskId={task.id} />
              </CommentsPanel>
            )}
          </div>
        )}
      </Sheet>
      {leaving && (
        <ConfirmDialog
          busyLabel="Closing…"
          confirmLabel="Close without saving"
          errorFallback="Could not close the task"
          onClose={() => setLeaving(false)}
          onConfirm={async () => onClose()}
          title="Close without saving the description?"
          tone="danger"
        >
          Your changes to the description will be lost.
        </ConfirmDialog>
      )}
    </>
  );
}
