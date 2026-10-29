import { useEffect, useState } from 'react';
import { ConfirmDialog, TextAreaField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from './LoadError';
import { Button, TextButton } from './Button';
import { Section } from './Page';
import type { Member } from '../spaces';
import { pageAnchorText, showPageBlock } from './page-blocks';

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

export interface CommentAnchors {
  noun: string;
  label: (blockId: string) => string;
  show: (blockId: string) => void;
}

const pageAnchors: CommentAnchors = {
  noun: 'text',
  label: (blockId) => pageAnchorText(blockId)?.trim().slice(0, 80) || 'Text that was removed',
  show: showPageBlock,
};

function AnchorLabel({ anchors, id }: { anchors: CommentAnchors; id: string }) {
  const [label, setLabel] = useState(() => anchors.label(id));
  useEffect(() => {
    const missing = anchors.label('');
    const found = () => {
      const current = anchors.label(id);
      setLabel(current);
      return current !== missing;
    };
    if (found()) return;
    const observer = new MutationObserver(() => found() && observer.disconnect());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchors, id]);
  return label;
}

function CommentForm({
  label,
  onSave,
  initial = '',
  onCancel,
  autoFocus,
  people = [],
}: {
  label: string;
  onSave: (body: string) => Promise<boolean>;
  initial?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
  people?: Member[];
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const typed = /(?:^|\s)@([^\s@]*)$/u.exec(body)?.[1];
  const suggested = typed === undefined ? [] : people.filter((person) => person.displayName.toLocaleLowerCase().includes(typed.toLocaleLowerCase())).slice(0, 5);
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
      <TextAreaField autoFocus={autoFocus} label={label} maxLength={2_000} onChange={(event) => setBody(event.currentTarget.value)} rows={2} value={body} />
      {suggested.length > 0 && (
        <div aria-label="Mention someone" className="flex flex-wrap gap-x-3 gap-y-1 text-sm" role="group">
          {suggested.map((person) => (
            <TextButton key={person.userId} label={`@${person.displayName}`} onClick={() => setBody(`${body.slice(0, body.length - typed!.length)}${person.displayName} `)} />
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button disabled={!body.trim() || busy} label={label} submit />
        {onCancel && (
          <TextButton label="Cancel" onClick={onCancel} />
        )}
      </div>
    </form>
  );
}

export function NoteComments({
  noteId,
  editable,
  commentable,
  owner,
  quoting,
  onQuoteDone,
  onBlocks,
  anchors = pageAnchors,
  people,
  focused,
}: {
  noteId: string;
  editable: boolean;
  commentable: boolean;
  owner: boolean;
  quoting?: QuotedBlock;
  onQuoteDone: () => void;
  onBlocks: (blockIds: string[]) => void;
  anchors?: CommentAnchors;
  people?: Member[];
  focused?: { id: string };
}) {
  const auth = useAuth();
  const comments = useResource<NoteComment[]>(`/notes/${noteId}/comments`, true, { live: ['page-comments', 'spaces'], itemIds: [noteId] });
  const action = useAction();
  const [replying, setReplying] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [showResolved, setShowResolved] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; replies: number }>();
  const commented = (comments.data ?? [])
    .filter((comment) => comment.blockId && !comment.parentId && !comment.resolvedAt)
    .map((comment) => comment.blockId!)
    .join(' ');

  useEffect(() => onBlocks(commented ? commented.split(' ') : []), [commented, onBlocks]);

  useEffect(() => {
    const thread = focused && document.querySelector<HTMLElement>(`article[data-block-id="${CSS.escape(focused.id)}"]`);
    if (!thread) return;
    thread.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    thread.animate([{ backgroundColor: 'var(--color-line-soft)' }, { backgroundColor: 'transparent' }], { duration: 1600 });
  }, [focused]);

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
    }, 'Could not save the comment');
  const edit = (id: string, body: string) =>
    action.run(async () => {
      replace(await auth.request<NoteComment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }));
      setEditing(undefined);
      return '';
    }, 'Could not change the comment');
  const resolve = (id: string, done: boolean) =>
    action.run(async () => {
      replace(await auth.request<NoteComment>(`/comments/${id}/resolved`, { method: done ? 'PUT' : 'DELETE' }));
      return '';
    }, 'Could not change the comment');

  function renderComment(comment: NoteComment) {
    const mine = comment.author?.id === auth.user?.id;
    if (editing === comment.id) {
      return <CommentForm initial={comment.body} key={comment.id} label="Save comment" onCancel={() => setEditing(undefined)} onSave={(body) => edit(comment.id, body)} people={people} />;
    }
    return (
      <div className="grid gap-1" key={comment.id}>
        <p className="mono-sm m-0 text-faint">
          {comment.author?.displayName ?? 'Former member'} · {timeAgo(comment.createdAt)}
          {comment.editedAt ? ' · edited' : ''}
        </p>
        {comment.blockId && (
          <button className="comment-block-quote cursor-pointer text-left" onClick={() => anchors.show(comment.blockId!)} type="button">
            <AnchorLabel anchors={anchors} id={comment.blockId} />
          </button>
        )}
        <p className="m-0 whitespace-pre-wrap break-words text-sm text-ink">{comment.body}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {commentable && !comment.parentId && !comment.resolvedAt && (
            <TextButton label="Reply" onClick={() => setReplying(comment.id)} />
          )}
          {!comment.parentId && editable && (
            <TextButton disabled={action.busy} label={comment.resolvedAt ? 'Reopen' : 'Resolve'} onClick={() => void resolve(comment.id, !comment.resolvedAt)} />
          )}
          {commentable && mine && <TextButton label="Edit" onClick={() => setEditing(comment.id)} />}
          {commentable && (mine || owner) && (
            <TextButton
              disabled={action.busy}
              label="Delete"
              onClick={() => setDeleting({ id: comment.id, replies: all.filter((reply) => reply.parentId === comment.id).length })}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Comments">
      {comments.refreshError && <LoadError compact error={comments.refreshError} onRetry={comments.reload} />}
      <Section action={resolved > 0 && <TextButton label={showResolved ? 'Hide resolved' : `Show ${resolved} resolved`} onClick={() => setShowResolved(!showResolved)} />} title="Comments">
        {shown.map((thread) => (
          <article className={`grid gap-3 ${thread.resolvedAt ? 'opacity-60' : ''}`} data-block-id={thread.blockId ?? undefined} key={thread.id}>
            {renderComment(thread)}
            <div className="grid gap-3 border-l border-line pl-4">
              {all.filter((comment) => comment.parentId === thread.id).map(renderComment)}
              {replying === thread.id && <CommentForm label="Reply" onCancel={() => setReplying(undefined)} onSave={(body) => add(body, thread.id)} people={people} />}
            </div>
          </article>
        ))}
        {commentable && (quoting ? (
          <div className="grid gap-2">
            <p className="comment-block-quote m-0">{quoting.excerpt || `An empty ${anchors.noun}`}</p>
            <CommentForm autoFocus key={quoting.id} label={`Comment on this ${anchors.noun}`} onCancel={onQuoteDone} onSave={(body) => add(body, undefined, quoting.id)} people={people} />
          </div>
        ) : (
          <CommentForm label="Comment" onSave={(body) => add(body)} people={people} />
        ))}
        {deleting && (
          <ConfirmDialog
            busyLabel="Deleting…"
            confirmLabel="Delete comment"
            errorFallback="Could not delete the comment"
            onClose={() => setDeleting(undefined)}
            onConfirm={async () => {
              await auth.request(`/comments/${deleting.id}`, { method: 'DELETE' });
              comments.mutate((current) => current.filter((comment) => comment.id !== deleting.id && comment.parentId !== deleting.id));
              action.report('Deleted the comment.');
            }}
            title="Delete this comment?"
            tone="danger"
          >
            {deleting.replies === 0
              ? 'It’s removed for everyone.'
              : deleting.replies === 1
                ? 'Its reply is deleted too.'
                : `Its ${deleting.replies} replies are deleted too.`}
          </ConfirmDialog>
        )}
      </Section>
    </section>
  );
}
