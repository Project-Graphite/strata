import { useDeferredValue, useState } from 'react';
import { Badge, Checkbox, IconButton, LinesSkeleton, SectionHeading, SegmentedControl, Select, TextField, useSnackbar } from '@project-graphite/ui';
import { describeActivity, type ActivityEvent } from '../activity';
import { readBlob, type Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { fileSize, maxUploadBytes, preparedUpload, saveBlob } from '../files';
import { completeTask, type Task, type TaskDetail } from '../tasks';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Button, TextButton } from './Button';
import { FileButton } from './FileButton';
import { LoadError } from './LoadError';
import { RichTextEditor, RichTextView, type RichDocument } from './RichText';

const sameDocument = (first: RichDocument, second: RichDocument) => JSON.stringify(first) === JSON.stringify(second);

function readDraft(key: string): RichDocument | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as RichDocument);
  } catch {
    return undefined;
  }
}

function writeDraft(key: string, value: RichDocument | undefined) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function TaskDescription({ editable, onSave, taskId, value }: { editable: boolean; onSave: (description: RichDocument) => void; taskId: string; value: RichDocument }) {
  const key = `strata-task-description:${useAuth().user?.id}:${taskId}`;
  const [draft, setDraft] = useState(() => readDraft(key));
  const [editing, setEditing] = useState(false);
  const change = (next: RichDocument) => {
    const kept = sameDocument(next, value) ? undefined : next;
    writeDraft(key, kept);
    setDraft(kept);
  };
  const discard = () => {
    writeDraft(key, undefined);
    setDraft(undefined);
    setEditing(false);
  };

  return (
    <section aria-label="Description" className="grid gap-2">
      <SectionHeading
        action={
          editable &&
          !editing && (
            <span className="flex flex-wrap items-center gap-2">
              {draft !== undefined && <Badge tone="wip">Unsaved changes</Badge>}
              {draft !== undefined && <TextButton danger label="Discard" onClick={discard} />}
              <TextButton label={draft === undefined ? 'Edit' : 'Continue editing'} onClick={() => setEditing(true)} />
            </span>
          )
        }
        level={3}
        title="Description"
      />
      {editing ? (
        <>
          <RichTextEditor autoFocus label="Description" onChange={change} placeholder="Add a description…" value={draft === undefined ? value : draft} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button label="Cancel" onClick={discard} />
            <Button
              label="Save"
              onClick={() => {
                if (draft !== undefined) onSave(draft);
                discard();
              }}
              primary
            />
          </div>
        </>
      ) : (
        <div
          className="task-description-view"
          data-editable={editable || undefined}
          onClick={(event) => {
            if (editable && !(event.target as HTMLElement).closest('a, input')) setEditing(true);
          }}
        >
          {value ? <RichTextView value={value} /> : <p className="m-0 text-muted">{editable ? 'Add a description…' : 'No description'}</p>}
        </div>
      )}
    </section>
  );
}

export function Subtasks({
  editable,
  onChanged,
  onOpen,
  task,
  update,
}: {
  editable: boolean;
  onChanged: () => void;
  onOpen: (task: Task) => void;
  task: TaskDetail;
  update: (change: (task: TaskDetail) => TaskDetail) => void;
}) {
  const auth = useAuth();
  const action = useAction();
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const replace = (subtask: Task) =>
    update((current) => {
      const subtasks = current.subtasks.map((shown) => (shown.id === subtask.id ? subtask : shown));
      return { ...current, subtasks, subtaskCounts: { total: subtasks.length, done: subtasks.filter((shown) => shown.completedAt).length } };
    });

  function toggle(subtask: Task) {
    setPending((current) => [...current, subtask.id]);
    replace({ ...subtask, completedAt: subtask.completedAt ? null : new Date().toISOString(), status: subtask.completedAt ? 'open' : 'done' });
    void action
      .run(async () => {
        try {
          if (subtask.completedAt) {
            replace(await auth.request<Task>(`/tasks/${subtask.id}/reopen`, { method: 'POST' }));
            onChanged();
            return '';
          }
          return await completeTask(auth.request, subtask, (updated) => {
            if (updated) replace(updated);
            onChanged();
          });
        } catch (reason) {
          replace(subtask);
          throw reason;
        }
      }, 'Could not update the subtask')
      .finally(() => setPending((current) => current.filter((id) => id !== subtask.id)));
  }

  return (
    <section className="grid gap-3">
      <SectionHeading
        action={task.subtasks.length > 0 && <span className="text-small text-muted tabular-nums">{`${task.subtaskCounts.done}/${task.subtasks.length}`}</span>}
        level={3}
        title="Subtasks"
      />
      {task.subtasks.length > 0 && (
        <ul className="panel-rows">
          {task.subtasks.map((subtask) => (
            <li className="list-row" key={subtask.id}>
              <span className="list-row-lead">
                <Checkbox
                  aria-label={subtask.completedAt ? `Mark ${subtask.title} as not done` : `Mark ${subtask.title} as done`}
                  checked={Boolean(subtask.completedAt)}
                  disabled={!editable || pending.includes(subtask.id)}
                  onChange={() => toggle(subtask)}
                />
              </span>
              <button className="list-row-main" onClick={() => onOpen(subtask)} type="button">
                <span className="list-row-title">
                  <span className={`task-title ${subtask.completedAt ? 'is-done text-faint' : ''}`}>{subtask.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form
          className="flex items-stretch gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = title.trim();
            if (!text) return;
            void action.run(async () => {
              const added = await auth.request<Task>(`/spaces/${task.spaceId}/tasks`, {
                method: 'POST',
                body: JSON.stringify({ title: text.slice(0, 200), parentId: task.id, listId: task.listId }),
              });
              setTitle('');
              update((current) => ({ ...current, subtasks: [...current.subtasks, added], subtaskCounts: { ...current.subtaskCounts, total: current.subtaskCounts.total + 1 } }));
              onChanged();
              return '';
            }, 'Could not add the subtask');
          }}
        >
          <input aria-label="Add a subtask" className="min-w-0 flex-1" maxLength={200} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Add a subtask" type="text" value={title} />
        </form>
      )}
    </section>
  );
}

interface Comment {
  id: string;
  body: string;
  document: RichDocument;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; displayName: string } | null;
}

type ActivityTab = 'all' | 'comments' | 'history';

const activityTabs: { value: ActivityTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'comments', label: 'Comments' },
  { value: 'history', label: 'History' },
];

const paragraphOf = (text: string): RichDocument => ({ type: 'doc', content: text.split('\n').map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) });

function CommentEditor({ initial, label, onCancel, onSave, saveLabel }: { initial: RichDocument; label: string; onCancel: () => void; onSave: (document: RichDocument, body: string) => Promise<unknown>; saveLabel: string }) {
  const [document, setDocument] = useState(initial);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-2">
      <RichTextEditor
        autoFocus
        compact
        label={label}
        onChange={(next, text) => {
          setDocument(next);
          setBody(text);
        }}
        placeholder="Write a comment…"
        value={initial}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button label="Cancel" onClick={onCancel} />
        <Button
          disabled={busy || !body || body.length > 2000}
          label={saveLabel}
          onClick={() => {
            setBusy(true);
            void onSave(document, body).finally(() => setBusy(false));
          }}
          primary
        />
      </div>
    </div>
  );
}

export function TaskActivity({ editable, owner, taskId }: { editable: boolean; owner: boolean; taskId: string }) {
  const auth = useAuth();
  const action = useAction();
  const [tab, setTab] = useState<ActivityTab>('all');
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<string>();
  const comments = useResource<Comment[]>(`/tasks/${taskId}/comments`, true, { live: ['task-details'], itemIds: [taskId] });
  const history = useResource<ResultPage<ActivityEvent>>(tab === 'comments' ? null : `/tasks/${taskId}/activity?page=1`, true, { live: ['tasks'], itemIds: [taskId] });
  const failed = [comments, ...(tab === 'comments' ? [] : [history])].find((resource) => resource.error);
  const loaded = comments.data && (tab === 'comments' || history.data);
  const entries = [
    ...(tab === 'history' ? [] : (comments.data ?? []).map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment }))),
    ...(tab === 'comments' ? [] : (history.data?.results ?? []).map((event) => ({ kind: 'event' as const, at: event.createdAt, event }))),
  ].sort((first, second) => first.at.localeCompare(second.at));

  const save = (path: string, method: 'POST' | 'PATCH', document: RichDocument, body: string, done: (saved: Comment) => void) =>
    action.run(async () => {
      const saved = await auth.request<Comment>(path, { method, body: JSON.stringify({ body, ...(document ? { document } : {}) }) });
      done(saved);
      return '';
    }, 'Could not save the comment');

  return (
    <details className="task-activity" open>
      <summary className="text-h3 text-ink">Activity</summary>
      <div className="task-activity-body grid">
        <SegmentedControl label="Show" onChange={setTab} options={activityTabs} size="small" value={tab} />
        {editable && tab !== 'history' &&
          (writing ? (
            <CommentEditor
              initial={null}
              label="New comment"
              onCancel={() => setWriting(false)}
              onSave={(document, body) =>
                save(`/tasks/${taskId}/comments`, 'POST', document, body, (added) => {
                  comments.mutate((current) => [...current, added]);
                  setWriting(false);
                })
              }
              saveLabel="Comment"
            />
          ) : (
            <button className="task-comment-prompt" onClick={() => setWriting(true)} type="button">
              Add a comment…
            </button>
          ))}
        {failed ? (
          <LoadError compact error={failed.error} onRetry={failed.reload} />
        ) : !loaded ? (
          <LinesSkeleton label="Loading the activity" lines={2} />
        ) : entries.length === 0 ? (
          <p className="m-0 text-small text-muted">{tab === 'comments' ? 'No comments yet' : 'Nothing has happened yet'}</p>
        ) : (
          <ol className="m-0 grid list-none gap-4 p-0">
            {entries.map((entry) => {
              if (entry.kind === 'event') {
                return (
                  <li className="flex items-baseline justify-between gap-4 text-small" key={`event-${entry.event.id}`}>
                    <span className="min-w-0 text-ink">{describeActivity(entry.event)}</span>
                    <span className="shrink-0 text-muted">{formatMoment(entry.event.createdAt)}</span>
                  </li>
                );
              }
              const { comment } = entry;
              const mine = comment.author?.id === auth.user?.id;
              return (
                <li className="grid gap-2" key={`comment-${comment.id}`}>
                  <p className="m-0 text-small text-muted">
                    <span className="text-ink">{comment.author?.displayName ?? 'Someone'}</span> · {formatMoment(comment.createdAt)}
                    {comment.editedAt && ' · edited'}
                  </p>
                  {editing === comment.id ? (
                    <CommentEditor
                      initial={comment.document ?? paragraphOf(comment.body)}
                      label="Edit comment"
                      onCancel={() => setEditing(undefined)}
                      onSave={(document, body) =>
                        save(`/tasks/${taskId}/comments/${comment.id}`, 'PATCH', document, body, (saved) => {
                          comments.mutate((current) => current.map((shown) => (shown.id === saved.id ? saved : shown)));
                          setEditing(undefined);
                        })
                      }
                      saveLabel="Save"
                    />
                  ) : comment.document ? (
                    <RichTextView value={comment.document} />
                  ) : (
                    <p className="m-0 whitespace-pre-wrap break-words text-body text-ink">{comment.body}</p>
                  )}
                  {editable && (mine || owner) && editing !== comment.id && (
                    <div className="flex gap-1">
                      {mine && <TextButton label="Edit" onClick={() => setEditing(comment.id)} />}
                      <TextButton
                        danger
                        disabled={action.busy}
                        label="Delete"
                        onClick={() =>
                          void action.run(async () => {
                            await auth.request(`/tasks/${taskId}/comments/${comment.id}`, { method: 'DELETE' });
                            comments.mutate((current) => current.filter((shown) => shown.id !== comment.id));
                            return 'Deleted the comment.';
                          }, 'Could not delete the comment')
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </details>
  );
}

interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export function Attachments({ editable, taskId }: { editable: boolean; taskId: string }) {
  const auth = useAuth();
  const action = useAction();
  const show = useSnackbar();
  const attachments = useResource<Attachment[]>(`/tasks/${taskId}/attachments`, true, { live: ['task-details'], itemIds: [taskId] });

  return (
    <section className="grid gap-3">
      <SectionHeading
        action={
          editable && (
            <FileButton
              busy={action.busy}
              label="Attach"
              multiple
              onFiles={(files) =>
                void action.run(async () => {
                  const accepted = files.filter((file) => file.size <= maxUploadBytes);
                  for (const file of accepted) {
                    const added = await auth.request<Attachment>(`/tasks/${taskId}/attachments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
                      body: await preparedUpload(file),
                    });
                    attachments.mutate((current) => [...current.filter((shown) => shown.id !== added.id), added]);
                  }
                  const refused = files.length - accepted.length;
                  return refused ? `${refused === 1 ? 'One file is' : `${refused} files are`} over 25 MB.` : '';
                }, 'Could not attach the file')
              }
            />
          )
        }
        level={3}
        title="Attachments"
      />
      {attachments.error ? (
        <LoadError compact error={attachments.error} onRetry={attachments.reload} />
      ) : !attachments.data ? (
        <LinesSkeleton label="Loading the attachments" lines={1} />
      ) : (
        attachments.data.length > 0 && (
          <ul className="panel-rows">
            {attachments.data.map((file) => (
              <li className="list-row" key={file.id}>
                <button
                  className="list-row-main"
                  onClick={() =>
                    void auth.request<Blob>(`/files/${file.id}`, {}, readBlob).then(
                      (blob) => saveBlob(blob, file.name),
                      () => show({ message: `Could not download ${file.name}.`, tone: 'error' }),
                    )
                  }
                  type="button"
                >
                  <span className="list-row-text">
                    <span className="list-row-title">{file.name}</span>
                    <span className="list-row-meta">{fileSize(file.sizeBytes)}</span>
                  </span>
                </button>
                {editable && (
                  <span className="list-row-trail">
                    <IconButton
                      icon="x"
                      label={`Remove ${file.name}`}
                      onClick={() =>
                        void action.run(async () => {
                          await auth.request(`/tasks/${taskId}/attachments/${file.id}`, { method: 'DELETE' });
                          attachments.mutate((current) => current.filter((shown) => shown.id !== file.id));
                          return `Removed ${file.name}. The file stays in Files.`;
                        }, 'Could not remove the attachment')
                      }
                      size="small"
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

interface Relation {
  id: string;
  kind: string;
  item: { id: string; kind: string; title: string };
}

const relationChoices = [
  { value: 'relates', label: 'Relates to', kind: 'relates', incoming: false },
  { value: 'blocks', label: 'Blocks', kind: 'blocks', incoming: false },
  { value: 'blocked-by', label: 'Is blocked by', kind: 'blocks', incoming: true },
  { value: 'duplicates', label: 'Duplicates', kind: 'duplicates', incoming: false },
  { value: 'duplicated-by', label: 'Is duplicated by', kind: 'duplicates', incoming: true },
];

const relationKinds = new Set(['relates', 'blocks', 'duplicates']);
const relationLabel = (kind: string, incoming: boolean) =>
  kind === 'relates' ? 'Relates to' : kind === 'blocks' ? (incoming ? 'Is blocked by' : 'Blocks') : incoming ? 'Is duplicated by' : 'Duplicates';

export function Relations({ editable, onOpen, taskId }: { editable: boolean; onOpen: (taskId: string) => void; taskId: string }) {
  const auth = useAuth();
  const action = useAction();
  const links = useResource<{ outgoing: Relation[]; backlinks: Relation[] }>(`/items/${taskId}/links`, true, { live: ['task-details'], itemIds: [taskId] });
  const [adding, setAdding] = useState(false);
  const [relation, setRelation] = useState('relates');
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim());
  const found = useResource<{ items: { id: string; kind: string; title: string; spaceName?: string | null }[] }>(adding && search ? `/search?q=${encodeURIComponent(search)}` : null, true);
  const shown = [
    ...(links.data?.outgoing ?? []).filter((link) => relationKinds.has(link.kind)).map((link) => ({ ...link, label: relationLabel(link.kind, false) })),
    ...(links.data?.backlinks ?? []).filter((link) => relationKinds.has(link.kind)).map((link) => ({ ...link, label: relationLabel(link.kind, true) })),
  ];
  const candidates = (found.data?.items ?? []).filter((item) => item.kind === 'task' && item.id !== taskId && !shown.some((link) => link.item.id === item.id));

  function relate(targetId: string, title: string) {
    const { incoming, kind } = relationChoices.find((choice) => choice.value === relation)!;
    void action.run(async () => {
      await auth.request(`/items/${incoming ? targetId : taskId}/links`, { method: 'POST', body: JSON.stringify({ targetId: incoming ? taskId : targetId, kind }) });
      links.reload();
      setAdding(false);
      setQuery('');
      return `Related ${title}.`;
    }, 'Could not relate the tasks');
  }

  return (
    <section className="grid gap-3">
      <SectionHeading action={editable && !adding && <TextButton label="Relate a task" onClick={() => setAdding(true)} />} level={3} title="Related tasks" />
      {links.error ? (
        <LoadError compact error={links.error} onRetry={links.reload} />
      ) : !links.data ? (
        <LinesSkeleton label="Loading the related tasks" lines={1} />
      ) : (
        shown.length > 0 && (
          <ul className="panel-rows">
            {shown.map((link) => (
              <li className="list-row" key={link.id}>
                <button className="list-row-main" onClick={() => onOpen(link.item.id)} type="button">
                  <span className="list-row-text">
                    <span className="list-row-meta">{link.label}</span>
                    <span className="list-row-title">{link.item.title || 'Untitled task'}</span>
                  </span>
                </button>
                {editable && (
                  <span className="list-row-trail">
                    <IconButton
                      icon="x"
                      label={`Remove the relation to ${link.item.title}`}
                      onClick={() =>
                        void action.run(async () => {
                          await auth.request(`/items/${taskId}/links/${link.id}`, { method: 'DELETE' });
                          links.reload();
                          return '';
                        }, 'Could not remove the relation')
                      }
                      size="small"
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      {adding && (
        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Select label="This task" onChange={setRelation} options={relationChoices} value={relation} />
            <TextField autoFocus label="Find a task" onChange={(event) => setQuery(event.currentTarget.value)} value={query} />
          </div>
          {candidates.length > 0 && (
            <ul className="panel-rows">
              {candidates.slice(0, 8).map((item) => (
                <li className="list-row" key={item.id}>
                  <button className="list-row-main" disabled={action.busy} onClick={() => relate(item.id, item.title)} type="button">
                    <span className="list-row-text">
                      <span className="list-row-title">{item.title || 'Untitled task'}</span>
                      {item.spaceName && <span className="list-row-meta">{item.spaceName}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search && found.data && candidates.length === 0 && <p className="m-0 text-small text-muted">No matching tasks</p>}
          <TextButton label="Cancel" onClick={() => { setAdding(false); setQuery(''); }} />
        </div>
      )}
    </section>
  );
}
