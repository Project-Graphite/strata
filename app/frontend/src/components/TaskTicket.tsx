import { useEffect, useRef, useState } from 'react';
import { Checkbox, FloatingToolbar, IconButton, LinesSkeleton, SectionHeading, TextAreaField, TextField, timeAgo, ToolbarButton, useSnackbar, type IconName } from '@project-graphite/ui';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
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
import { Hint } from './Hint';

type Description = Record<string, unknown> | null;

const formatting: [IconName, string, (editor: Editor) => boolean, (editor: Editor) => void][] = [
  ['bold', 'Bold', (editor) => editor.isActive('bold'), (editor) => editor.chain().focus().toggleBold().run()],
  ['italic', 'Italic', (editor) => editor.isActive('italic'), (editor) => editor.chain().focus().toggleItalic().run()],
  ['highlight', 'Highlight', (editor) => editor.isActive('highlight'), (editor) => editor.chain().focus().toggleHighlight().run()],
  ['list', 'Bulleted list', (editor) => editor.isActive('bulletList'), (editor) => editor.chain().focus().toggleBulletList().run()],
  ['list-ordered', 'Numbered list', (editor) => editor.isActive('orderedList'), (editor) => editor.chain().focus().toggleOrderedList().run()],
  ['checklist', 'Checklist', (editor) => editor.isActive('taskList'), (editor) => editor.chain().focus().toggleTaskList().run()],
  ['code', 'Code block', (editor) => editor.isActive('codeBlock'), (editor) => editor.chain().focus().toggleCodeBlock().run()],
];

function DescriptionToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({ editor, selector: ({ editor: current }) => formatting.map(([, , isActive]) => isActive(current)) });
  return (
    <FloatingToolbar className="task-description-toolbar" label="Formatting">
      {formatting.map(([icon, label, , run], index) => (
        <ToolbarButton active={active[index]} icon={icon} key={label} label={label} onClick={() => run(editor)} />
      ))}
    </FloatingToolbar>
  );
}

export function DescriptionEditor({ editable, onSave, value }: { editable: boolean; onSave: (description: Description) => void; value: Description }) {
  const timer = useRef<number>(undefined);
  const latest = useRef(onSave);
  latest.current = onSave;
  const editor = useEditor({
    content: value ?? undefined,
    editable,
    extensions: [
      StarterKit.configure({ link: { openOnClick: true, autolink: true, protocols: ['https', 'http', 'mailto'] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({ placeholder: editable ? 'Add a description…' : '' }),
    ],
    editorProps: { attributes: { 'aria-label': 'Description', class: 'note-content task-description' } },
    onUpdate: ({ editor: current }) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        latest.current(current.isEmpty ? null : current.getJSON());
      }, 800);
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  useEffect(
    () => () => {
      if (timer.current === undefined || !editor) return;
      window.clearTimeout(timer.current);
      latest.current(editor.isEmpty ? null : editor.getJSON());
    },
    [editor],
  );

  if (!editor) return <LinesSkeleton label="Loading the description" lines={3} />;
  return (
    <div className="grid gap-2">
      {editable && <DescriptionToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
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
      <SectionHeading level={3} title={`Subtasks${task.subtasks.length ? ` · ${task.subtaskCounts.done}/${task.subtasks.length}` : ''}`} />
      {task.subtasks.length > 0 && (
        <ul className="panel-rows">
          {task.subtasks.map((subtask) => (
            <li className="list-row" data-dense key={subtask.id}>
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
          <TextField className="min-w-0 flex-1" label="Add a subtask" maxLength={200} onChange={(event) => setTitle(event.currentTarget.value)} value={title} />
        </form>
      )}
    </section>
  );
}

interface Comment {
  id: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; displayName: string } | null;
}

export function Comments({ editable, owner, taskId }: { editable: boolean; owner: boolean; taskId: string }) {
  const auth = useAuth();
  const action = useAction();
  const comments = useResource<Comment[]>(`/tasks/${taskId}/comments`, true, { live: ['task-details'], itemIds: [taskId] });
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string }>();

  return (
    <section className="grid gap-3">
      <SectionHeading level={3} title="Comments" />
      {comments.error ? (
        <Hint>{comments.error}</Hint>
      ) : !comments.data ? (
        <LinesSkeleton label="Loading the comments" lines={2} />
      ) : (
        comments.data.length > 0 && (
          <ul className="m-0 grid list-none gap-4 p-0">
            {comments.data.map((comment) => {
              const mine = comment.author?.id === auth.user?.id;
              return (
                <li className="grid gap-1" key={comment.id}>
                  <p className="m-0 text-small text-muted">
                    <span className="text-ink">{comment.author?.displayName ?? 'Someone'}</span> · {formatMoment(comment.createdAt)}
                    {comment.editedAt && ' · edited'}
                  </p>
                  {editing?.id === comment.id ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!editing.body.trim()) return;
                        void action
                          .run(async () => {
                            const saved = await auth.request<Comment>(`/tasks/${taskId}/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ body: editing.body.trim() }) });
                            comments.mutate((current) => current.map((shown) => (shown.id === saved.id ? saved : shown)));
                            return '';
                          }, 'Could not save the comment')
                          .then((saved) => saved && setEditing(undefined));
                      }}
                    >
                      <TextAreaField autoFocus label="Comment" maxLength={2000} onChange={(event) => setEditing({ id: comment.id, body: event.currentTarget.value })} rows={2} value={editing.body} />
                      <div className="flex gap-2">
                        <TextButton label="Cancel" onClick={() => setEditing(undefined)} />
                        <Button disabled={action.busy} label="Save" submit />
                      </div>
                    </form>
                  ) : (
                    <p className="m-0 whitespace-pre-wrap break-words text-body text-ink">{comment.body}</p>
                  )}
                  {editable && (mine || owner) && editing?.id !== comment.id && (
                    <div className="flex gap-1">
                      {mine && <TextButton label="Edit" onClick={() => setEditing({ id: comment.id, body: comment.body })} />}
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
          </ul>
        )
      )}
      {editable && (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            void action.run(async () => {
              const added = await auth.request<Comment>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body: draft.trim() }) });
              comments.mutate((current) => [...current, added]);
              setDraft('');
              return '';
            }, 'Could not add the comment');
          }}
        >
          <TextAreaField label="Write a comment" maxLength={2000} onChange={(event) => setDraft(event.currentTarget.value)} rows={2} value={draft} />
          <div className="flex justify-end">
            <Button disabled={!draft.trim() || action.busy} label="Comment" submit />
          </div>
        </form>
      )}
    </section>
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
        <Hint>{attachments.error}</Hint>
      ) : !attachments.data ? (
        <LinesSkeleton label="Loading the attachments" lines={1} />
      ) : (
        attachments.data.length > 0 && (
          <ul className="panel-rows">
            {attachments.data.map((file) => (
              <li className="list-row" data-dense key={file.id}>
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

export function Activity({ taskId }: { taskId: string }) {
  const activity = useResource<ResultPage<ActivityEvent>>(`/tasks/${taskId}/activity?page=1`, true, { live: ['tasks'], itemIds: [taskId] });
  if (activity.error) return <Hint>{activity.error}</Hint>;
  if (!activity.data) return <LinesSkeleton label="Loading the activity" lines={2} />;
  return (
    <ol className="m-0 grid list-none gap-2 p-0">
      {activity.data.results.map((event) => (
        <li className="flex items-baseline justify-between gap-4 text-small" key={event.id}>
          <span className="min-w-0 text-ink">{describeActivity(event)}</span>
          <span className="shrink-0 text-muted">{timeAgo(event.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}
