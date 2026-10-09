import { useEffect, useState } from 'react';
import { timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from './LoadError';

interface NoteComment {
  id: string;
  parentId: string | null;
  blockId: string | null;
  body: string;
  resolvedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; displayName: string } | null;
}

export interface QuotedBlock {
  id: string;
  excerpt: string;
}

const blockElement = (blockId: string) => document.querySelector<HTMLElement>(`.note-content [data-id="${CSS.escape(blockId)}"]`);

function CommentForm({
  label,
  onSave,
  initial = '',
  onCancel,
  autoFocus,
}: {
  label: string;
  onSave: (body: string) => Promise<boolean>;
  initial?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onSave(body.trim()).then((saved) => {
          setBusy(false);
          if (saved && !initial) setBody('');
        });
      }}
    >
      <textarea aria-label={label} autoFocus={autoFocus} maxLength={2_000} onChange={(event) => setBody(event.currentTarget.value)} placeholder={label} rows={2} value={body} />
      <div className="flex gap-2">
        <button className="secondary-button px-3 py-1.5 text-sm" disabled={!body.trim() || busy} type="submit">
          {label}
        </button>
        {onCancel && (
          <button className="text-button text-sm" onClick={onCancel} type="button">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function NoteComments({
  noteId,
  editable,
  owner,
  quoting,
  onQuoteDone,
  onBlocks,
}: {
  noteId: string;
  editable: boolean;
  owner: boolean;
  quoting?: QuotedBlock;
  onQuoteDone: () => void;
  onBlocks: (blockIds: string[]) => void;
}) {
  const auth = useAuth();
  const comments = useResource<NoteComment[]>(`/notes/${noteId}/comments`, true);
  const action = useAction();
  const [replying, setReplying] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [showResolved, setShowResolved] = useState(false);
  const commented = (comments.data ?? [])
    .filter((comment) => comment.blockId && !comment.parentId && !comment.resolvedAt)
    .map((comment) => comment.blockId!)
    .join(' ');

  useEffect(() => onBlocks(commented ? commented.split(' ') : []), [commented, onBlocks]);

  if (comments.error) return <LoadError compact error={comments.error} onRetry={comments.reload} />;
  if (!comments.data) return null;
  const all = comments.data;
  const threads = all.filter((comment) => !comment.parentId);
  const resolved = threads.filter((thread) => thread.resolvedAt).length;
  const shown = threads.filter((thread) => showResolved || !thread.resolvedAt);

  const replace = (saved: NoteComment) => comments.mutate((current) => current.map((comment) => (comment.id === saved.id ? saved : comment)));
  const add = (body: string, parentId?: string, blockId?: string) =>
    action.run(async () => {
      const saved = await auth.request<NoteComment>(`/notes/${noteId}/comments`, { method: 'POST', body: JSON.stringify({ body, parentId, blockId }) });
      comments.mutate((current) => [...current, saved]);
      setReplying(undefined);
      if (blockId) onQuoteDone();
      return '';
    }, 'The comment could not be saved.');
  const edit = (id: string, body: string) =>
    action.run(async () => {
      replace(await auth.request<NoteComment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }));
      setEditing(undefined);
      return '';
    }, 'The comment could not be changed.');
  const remove = (id: string) =>
    action.run(async () => {
      await auth.request(`/comments/${id}`, { method: 'DELETE' });
      comments.mutate((current) => current.filter((comment) => comment.id !== id && comment.parentId !== id));
      return 'Comment deleted.';
    }, 'The comment could not be deleted.');
  const resolve = (id: string, done: boolean) =>
    action.run(async () => {
      replace(await auth.request<NoteComment>(`/comments/${id}/resolved`, { method: done ? 'PUT' : 'DELETE' }));
      return '';
    }, 'The comment could not be changed.');

  function renderComment(comment: NoteComment) {
    const mine = comment.author?.id === auth.user?.id;
    if (editing === comment.id) {
      return <CommentForm initial={comment.body} key={comment.id} label="Save comment" onCancel={() => setEditing(undefined)} onSave={(body) => edit(comment.id, body)} />;
    }
    return (
      <div className="grid gap-1" key={comment.id}>
        <p className="mono-sm m-0 text-faint">
          {comment.author?.displayName ?? 'Former member'} · {timeAgo(comment.createdAt)}
          {comment.editedAt ? ' · edited' : ''}
        </p>
        {comment.blockId && (
          <button
            className="comment-block-quote"
            onClick={() => {
              const block = blockElement(comment.blockId!);
              block?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              block?.classList.add('is-flashing');
              window.setTimeout(() => block?.classList.remove('is-flashing'), 1600);
            }}
            type="button"
          >
            {blockElement(comment.blockId)?.textContent?.trim().slice(0, 80) || 'A block that was removed'}
          </button>
        )}
        <p className="m-0 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {!comment.parentId && !comment.resolvedAt && (
            <button className="text-button" onClick={() => setReplying(comment.id)} type="button">
              Reply
            </button>
          )}
          {!comment.parentId && editable && (
            <button className="text-button" disabled={action.busy} onClick={() => void resolve(comment.id, !comment.resolvedAt)} type="button">
              {comment.resolvedAt ? 'Reopen' : 'Resolve'}
            </button>
          )}
          {mine && (
            <button className="text-button" onClick={() => setEditing(comment.id)} type="button">
              Edit
            </button>
          )}
          {(mine || owner) && (
            <button className="text-button" disabled={action.busy} onClick={() => void remove(comment.id)} type="button">
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Comments" className="grid gap-4 border-t border-line-soft pt-6">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-sm font-medium text-muted">Comments</h2>
        {resolved > 0 && (
          <button className="text-button text-sm" onClick={() => setShowResolved(!showResolved)} type="button">
            {showResolved ? 'Hide resolved' : `Show ${resolved} resolved`}
          </button>
        )}
      </div>
      {shown.map((thread) => (
        <article className={`grid gap-3 ${thread.resolvedAt ? 'opacity-60' : ''}`} key={thread.id}>
          {renderComment(thread)}
          <div className="grid gap-3 border-l border-line pl-4">
            {all.filter((comment) => comment.parentId === thread.id).map(renderComment)}
            {replying === thread.id && <CommentForm label="Reply" onCancel={() => setReplying(undefined)} onSave={(body) => add(body, thread.id)} />}
          </div>
        </article>
      ))}
      {quoting ? (
        <div className="grid gap-2">
          <p className="comment-block-quote m-0">{quoting.excerpt || 'An empty block'}</p>
          <CommentForm autoFocus key={quoting.id} label="Comment on this block" onCancel={onQuoteDone} onSave={(body) => add(body, undefined, quoting.id)} />
        </div>
      ) : (
        <CommentForm label="Comment" onSave={(body) => add(body)} />
      )}
    </section>
  );
}
