import { Fragment, lazy, Suspense } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState, Icon, LinesSkeleton, PageSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { LoadError } from '../components/LoadError';
import { noteTitle, type Note, type NoteDetails } from '../notes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const NoteEditor = lazy(() => import('../components/NoteEditor'));

export function NotePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const note = useResource<NoteDetails>(`/notes/${id}`, true);
  const pages = useResource<Note[]>(note.data ? `/spaces/${note.data.spaceId}/notes` : null, true);
  const renaming = useAction();
  const adding = useAction();

  if (note.status === 404) {
    return (
      <EmptyState title="Page not found">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">It may have been deleted, or you are not a member of its space.</p>
      </EmptyState>
    );
  }
  if (note.error) return <LoadError error={note.error} onRetry={note.reload} />;
  if (!note.data) return <PageSkeleton label="Opening the page" />;
  const details = note.data;
  const space = spaces.data?.find((candidate) => candidate.id === details.spaceId);
  const children = (pages.data ?? []).filter((page) => page.parentId === details.id);

  function rename(next: string) {
    if (next === details.title) return;
    void renaming.run(async () => {
      const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify({ title: next }) });
      note.mutate((current) => ({ ...current, ...saved }));
      pages.mutate((current) => current.map((page) => (page.id === saved.id ? saved : page)));
      return '';
    }, 'Could not rename the page');
  }

  return (
    <article className="page-enter grid max-w-3xl gap-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <Link className="text-muted no-underline hover:text-ink" to={`/spaces/${details.spaceId}/notes`}>
          {space?.name ?? 'Space'}
        </Link>
        {details.path.map((step) => (
          <Fragment key={step.id}>
            <span aria-hidden="true">/</span>
            <Link className="text-muted no-underline hover:text-ink" to={`/notes/${step.id}`}>
              {noteTitle(step)}
            </Link>
          </Fragment>
        ))}
      </nav>
      <input
        aria-label="Page title"
        className="note-title"
        defaultValue={details.title}
        key={details.id}
        maxLength={200}
        onBlur={(event) => details.editable && rename(event.currentTarget.value.trim())}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        placeholder="Untitled"
        readOnly={!details.editable}
      />
      <Suspense fallback={<LinesSkeleton label="Loading the editor" lines={6} />}>
        <NoteEditor editable={details.editable} key={details.id} noteId={details.id} />
      </Suspense>
      {(children.length > 0 || details.editable) && (
        <section className="grid gap-2 border-t border-line-soft pt-6">
          <h2 className="m-0 text-sm font-medium text-muted">Pages inside</h2>
          {children.length > 0 && (
            <ul className="m-0 grid list-none gap-1 p-0">
              {children.map((child) => (
                <li key={child.id}>
                  <Link className="text-ink no-underline hover:underline" to={`/notes/${child.id}`}>
                    {child.icon ? `${child.icon} ` : ''}
                    {noteTitle(child)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {details.editable && (
            <button
              className="text-button inline-flex w-fit items-center gap-1.5 text-sm"
              disabled={adding.busy}
              onClick={() =>
                void adding.run(async () => {
                  const created = await auth.request<Note>(`/spaces/${details.spaceId}/notes`, {
                    method: 'POST',
                    body: JSON.stringify({ parentId: details.id }),
                  });
                  navigate(`/notes/${created.id}`);
                  return '';
                }, 'Could not add the page')
              }
              type="button"
            >
              <Icon name="plus" size={14} />
              Add a page inside
            </button>
          )}
        </section>
      )}
    </article>
  );
}
