import MuiIconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import { startTransition, useDeferredValue, useState, ViewTransition } from 'react';
import { Badge, Checkbox, IconButton, LinesSkeleton, SectionHeading, SegmentedControl, Select, TextField, useSnackbar } from '@project-graphite/ui';
import { describeActivity, type ActivityEvent } from '../activity';
import { readBlob, type Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { homePath, type Member } from '../spaces';
import { fileSize, maxUploadBytes, preparedUpload, saveBlob } from '../files';
import { completeTask, type Task, type TaskDetail } from '../tasks';
import { Reveal, useHeightMorph } from '../motion';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { paragraphOf } from '../task-draft';
import { useResource } from '../useResource';
import { Button } from './Button';
import { FileButton } from './FileButton';
import { ReplyGlyph, SmileGlyph } from './glyphs';
import { UserAvatar } from './UserAvatar';
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
  const body = useHeightMorph<HTMLDivElement>();
  const edit = () => body.morph(() => setEditing(true));

  return (
    <section aria-label="Description" className="grid gap-2">
      <SectionHeading
        action={
          editable &&
          !editing && (
            <span className="flex flex-wrap items-center gap-2">
              {draft !== undefined && <Badge tone="wip">Unsaved changes</Badge>}
              {draft !== undefined && <IconButton icon="trash" label="Discard unsaved changes" onClick={discard} size="small" />}
              <IconButton icon="pencil" label={draft === undefined ? 'Edit the description' : 'Continue editing'} onClick={edit} size="small" />
            </span>
          )
        }
        level={3}
        title="Description"
      />
      <div className="grid gap-2" ref={body.ref}>
        {editing ? (
          <>
            <RichTextEditor autoFocus label="Description" onChange={change} placeholder="Add a description…" value={draft === undefined ? value : draft} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button label="Cancel" onClick={() => body.morph(discard)} />
              <Button
                label="Save"
                onClick={() =>
                  body.morph(() => {
                    if (draft !== undefined) onSave(draft);
                    discard();
                  })
                }
                primary
              />
            </div>
          </>
        ) : (
          <div
            className="task-description-view"
            data-editable={editable || undefined}
            onClick={(event) => {
              if (editable && !(event.target as HTMLElement).closest('a, input')) edit();
            }}
          >
            {value ? <RichTextView value={value} /> : <p className="m-0 text-muted">{editable ? 'Add a description…' : 'No description'}</p>}
          </div>
        )}
      </div>
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
            replace(updated);
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
            <li className={`list-row ${subtask.completedAt ? 'task-done' : ''}`} key={subtask.id}>
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
              const added = await auth.request<Task>(homePath(task.spaceId, 'tasks'), {
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
  parentId: string | null;
  author: { id: string; displayName: string } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
}

type ActivityTab = 'comments' | 'history' | 'all';

const activityTabs: { value: ActivityTab; label: string }[] = [
  { value: 'comments', label: 'Comments' },
  { value: 'history', label: 'History' },
  { value: 'all', label: 'All' },
];

const reactionChoices = ['👍', '❤️', '🎉', '😄', '👀', '🚀'];


function CommentEditor({ initial, label, members, onCancel, onSave, saveLabel }: { initial: RichDocument; label: string; members?: Member[]; onCancel: () => void; onSave: (document: RichDocument, body: string) => Promise<unknown>; saveLabel: string }) {
  const [document, setDocument] = useState(initial);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-2">
      <RichTextEditor
        autoFocus
        compact
        label={label}
        mentions={members}
        onChange={(next, text) => {
          setDocument(next);
          setBody(text);
        }}
        placeholder="Write a comment… Type @ to mention someone."
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

function Reactions({ comment, onReact }: { comment: Comment; onReact: (emoji: string, on: boolean) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {comment.reactions.map((reaction) => (
        <button aria-label={`${reaction.emoji} ${reaction.count}`} aria-pressed={reaction.mine} className="reaction-chip" key={reaction.emoji} onClick={() => onReact(reaction.emoji, !reaction.mine)} type="button">
          <span aria-hidden="true">{reaction.emoji}</span>
          <span className="tabular-nums">{reaction.count}</span>
        </button>
      ))}
      <MuiIconButton aria-label="Add a reaction" onClick={(event) => setAnchor(event.currentTarget)} size="small" title="Add a reaction">
        <SmileGlyph />
      </MuiIconButton>
      <Popover anchorEl={anchor} anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }} onClose={() => setAnchor(null)} open={Boolean(anchor)} slotProps={{ paper: { className: 'reaction-picker' } }}>
        {reactionChoices.map((emoji) => (
          <button
            aria-label={`React with ${emoji}`}
            key={emoji}
            onClick={() => {
              setAnchor(null);
              onReact(emoji, !comment.reactions.some((reaction) => reaction.emoji === emoji && reaction.mine));
            }}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </Popover>
    </>
  );
}

export function TaskActivity({ editable, members, owner, taskId }: { editable: boolean; members?: Member[]; owner: boolean; taskId: string }) {
  const auth = useAuth();
  const action = useAction();
  const [tab, setTab] = useState<ActivityTab>('comments');
  const [writing, setWriting] = useState(false);
  const [posted, setPosted] = useState<string>();
  const composer = useHeightMorph<HTMLDivElement>();
  const [editing, setEditing] = useState<string>();
  const [replying, setReplying] = useState<string>();
  const comments = useResource<Comment[]>(`/tasks/${taskId}/comments`, true, { live: ['task-details'], itemIds: [taskId] });
  const history = useResource<ResultPage<ActivityEvent>>(tab === 'comments' ? null : `/tasks/${taskId}/activity?page=1`, true, { live: ['tasks'], itemIds: [taskId] });
  const failed = [comments, ...(tab === 'comments' ? [] : [history])].find((resource) => resource.error);
  const loaded = comments.data && (tab === 'comments' || history.data);
  const entries = [
    ...(tab === 'history' ? [] : (comments.data ?? []).filter((comment) => !comment.parentId).map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment }))),
    ...(tab === 'comments' ? [] : (history.data?.results ?? []).map((event) => ({ kind: 'event' as const, at: event.createdAt, event }))),
  ].sort((first, second) => second.at.localeCompare(first.at));

  const replace = (saved: Comment) => comments.mutate((current) => current.map((shown) => (shown.id === saved.id ? saved : shown)));

  const save = (path: string, method: 'POST' | 'PATCH', fields: { document: RichDocument; body: string; parentId?: string }, done: (saved: Comment) => void) =>
    action.run(async () => {
      const { document, ...rest } = fields;
      const saved = await auth.request<Comment>(path, { method, body: JSON.stringify({ ...rest, ...(document ? { document } : {}) }) });
      done(saved);
      return '';
    }, 'Could not save the comment');

  const react = (comment: Comment, emoji: string, on: boolean) =>
    void action.run(async () => {
      replace(await auth.request<Comment>(`/tasks/${taskId}/comments/${comment.id}/reactions/${encodeURIComponent(emoji)}`, { method: on ? 'PUT' : 'DELETE' }));
      return '';
    }, 'Could not change the reaction');

  const remove = (comment: Comment) =>
    void action.run(async () => {
      await auth.request(`/tasks/${taskId}/comments/${comment.id}`, { method: 'DELETE' });
      comments.mutate((current) => current.filter((shown) => shown.id !== comment.id && shown.parentId !== comment.id));
      return 'Deleted the comment.';
    }, 'Could not delete the comment');

  const item = (comment: Comment, reply: boolean) => {
    const mine = comment.author?.id === auth.user?.id;
    const replies = reply ? [] : (comments.data ?? []).filter((shown) => shown.parentId === comment.id);
    return (
      <li className="task-comment comment-entry" data-posted={posted === comment.id || undefined} key={comment.id}>
        <p className="comment-head m-0 text-small text-muted">
          <UserAvatar name={comment.author?.displayName ?? 'Someone'} size="sm" userId={comment.author?.id} />
          <span className="text-ink">{comment.author?.displayName ?? 'Someone'}</span> · {formatMoment(comment.createdAt)}
          {comment.editedAt && ' · edited'}
        </p>
        {editing === comment.id ? (
          <CommentEditor
            initial={comment.document ?? paragraphOf(comment.body)}
            label="Edit comment"
            members={members}
            onCancel={() => setEditing(undefined)}
            onSave={(document, body) =>
              save(`/tasks/${taskId}/comments/${comment.id}`, 'PATCH', { document, body }, (saved) => {
                replace(saved);
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
        {editing !== comment.id && (
          <div className="task-comment-actions">
            <Reactions comment={comment} onReact={(emoji, on) => react(comment, emoji, on)} />
            {editable && !reply && (
              <MuiIconButton aria-label="Reply" onClick={() => setReplying(comment.id)} size="small" title="Reply">
                <ReplyGlyph />
              </MuiIconButton>
            )}
            {editable && mine && <IconButton icon="pencil" label="Edit comment" onClick={() => setEditing(comment.id)} size="small" />}
            {editable && (mine || owner) && <IconButton disabled={action.busy} icon="trash" label="Delete comment" onClick={() => remove(comment)} size="small" />}
          </div>
        )}
        {(replies.length > 0 || replying === comment.id) && (
          <ol className="task-comment-replies">
            {replies.map((shown) => item(shown, true))}
            {replying === comment.id && (
              <li>
                <CommentEditor
                  initial={null}
                  label="Reply"
                  members={members}
                  onCancel={() => setReplying(undefined)}
                  onSave={(document, body) =>
                    save(`/tasks/${taskId}/comments`, 'POST', { document, body, parentId: comment.id }, (added) => {
                      comments.mutate((current) => [...current, added]);
                      setPosted(added.id);
                      setReplying(undefined);
                    })
                  }
                  saveLabel="Reply"
                />
              </li>
            )}
          </ol>
        )}
      </li>
    );
  };

  return (
    <details className="task-activity" open>
      <summary className="text-h3 text-ink">Activity</summary>
      <div className="task-activity-body grid">
        <SegmentedControl label="Show" onChange={(next) => startTransition(() => setTab(next))} options={activityTabs} size="small" value={tab} />
        <ViewTransition default="none" key={tab} name={`task-activity-${taskId}`} share="auto">
          <div className="grid gap-4">
            {editable && tab !== 'history' && (
              <div ref={composer.ref}>
                {writing ? (
                  <CommentEditor
                    initial={null}
                    label="New comment"
                    members={members}
                    onCancel={() => composer.morph(() => setWriting(false))}
                    onSave={(document, body) =>
                      save(`/tasks/${taskId}/comments`, 'POST', { document, body }, (added) => {
                        comments.mutate((current) => [...current, added]);
                        setPosted(added.id);
                        composer.morph(() => setWriting(false));
                      })
                    }
                    saveLabel="Comment"
                  />
                ) : (
                  <button className="task-comment-prompt" onClick={() => composer.morph(() => setWriting(true))} type="button">
                    Add a comment…
                  </button>
                )}
              </div>
            )}
            {failed ? (
              <LoadError compact error={failed.error} onRetry={failed.reload} />
            ) : !loaded ? (
              <LinesSkeleton label="Loading the activity" lines={2} />
            ) : entries.length === 0 ? (
              <p className="m-0 text-small text-muted">{tab === 'comments' ? 'No comments yet' : 'Nothing has happened yet'}</p>
            ) : (
              <ol className="task-activity-list m-0 grid list-none gap-5 p-0">
                {entries.map((entry) =>
                  entry.kind === 'event' ? (
                    <li className="flex items-center justify-between gap-4 text-small" key={`event-${entry.event.id}`}>
                      <span className="flex min-w-0 items-center gap-2 text-ink">
                        <UserAvatar name={entry.event.actor?.displayName ?? 'Someone'} size="sm" userId={entry.event.actor?.id} />
                        <span className="min-w-0">{describeActivity(entry.event)}</span>
                      </span>
                      <span className="shrink-0 text-muted">{formatMoment(entry.event.createdAt)}</span>
                    </li>
                  ) : (
                    item(entry.comment, false)
                  ),
                )}
              </ol>
            )}
          </div>
        </ViewTransition>
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
              iconOnly
              label="Attach files"
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
      <SectionHeading action={editable && !adding && <IconButton icon="plus" label="Relate a task" onClick={() => setAdding(true)} size="small" />} level={3} title="Related tasks" />
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
      <Reveal className="-mt-3" open={adding}>
        <div className="grid gap-3 pt-3">
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
          <IconButton
            className="justify-self-end"
            icon="x"
            label="Stop relating a task"
            onClick={() => {
              setAdding(false);
              setQuery('');
            }}
            size="small"
          />
        </div>
      </Reveal>
    </section>
  );
}
