import { Fragment, lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmDialog, EmptyState, Icon, LinesSkeleton, PageSkeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { DatabaseView } from '../components/database/DatabaseView';
import { IconPicker } from '../components/IconPicker';
import { PropertyField } from '../components/database/PropertyField';
import { LoadError } from '../components/LoadError';
import { NoteComments, type QuotedBlock } from '../components/NoteComments';
import { NoteHistory } from '../components/NoteHistory';
import { ShareLinks } from '../components/ShareLinks';
import { announcePagesChanged, noteTitle, type Note, type NoteDetails, type PropertyValues } from '../notes';
import { itemHref, useSpaces, type Member } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const NoteEditor = lazy(() => import('../components/NoteEditor'));
const BoardCanvas = lazy(() => import('../components/BoardCanvas'));

const wideKey = 'strata-wide-pages';

const widePages = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(wideKey) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
})();

export function NotePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const note = useResource<NoteDetails>(`/notes/${id}`, true);
  const [wide, setWide] = useState(() => widePages.has(id));
  if (wide !== widePages.has(id)) setWide(widePages.has(id));
  const [quoting, setQuoting] = useState<QuotedBlock & { noteId: string }>();
  const [commentedBlocks, setCommentedBlocks] = useState<string[]>([]);
  const pages = useResource<Note[]>(note.data ? `/spaces/${note.data.spaceId}/notes` : null, true);
  const links = useResource<{ backlinks: { id: string; kind: string; item: { id: string; spaceId: string; kind: string; title: string } }[] }>(
    note.data ? `/items/${note.data.id}/links` : null,
    true,
  );
  const members = useResource<Member[]>(
    note.data?.row?.properties.some((property) => property.type === 'person') ? `/spaces/${note.data.spaceId}/members` : null,
    true,
  );
  const backlinks = (links.data?.backlinks ?? []).filter((link) => link.kind === 'mention');
  const renaming = useAction();
  const adding = useAction();
  const marking = useAction();
  const converting = useAction();
  const setting = useAction();
  const [history, setHistory] = useState(false);
  const [unconverting, setUnconverting] = useState(false);

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

  function setIcon(icon: string | null) {
    void renaming.run(async () => {
      const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify({ icon }) });
      note.mutate((current) => ({ ...current, ...saved }));
      announcePagesChanged();
      pages.mutate((current) => current.map((page) => (page.id === saved.id ? saved : page)));
      return '';
    }, 'Could not change the icon');
  }

  function toggleWide() {
    if (!widePages.delete(details.id)) widePages.add(details.id);
    setWide(widePages.has(details.id));
    try {
      localStorage.setItem(wideKey, JSON.stringify([...widePages]));
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
  }

  function rename(next: string) {
    if (next === details.title) return;
    void renaming.run(async () => {
      const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify({ title: next }) });
      note.mutate((current) => ({ ...current, ...saved }));
      announcePagesChanged();
      pages.mutate((current) => current.map((page) => (page.id === saved.id ? saved : page)));
      return '';
    }, 'Could not rename the page');
  }

  function turnIntoDatabase() {
    const option = (name: string, color: string) => ({ id: crypto.randomUUID(), name, color });
    const status = { id: crypto.randomUUID(), name: 'Status', type: 'select', options: [option('To do', 'gray'), option('Doing', 'blue'), option('Done', 'green')] };
    void converting.run(async () => {
      await auth.request(`/notes/${details.id}/database`, {
        method: 'PUT',
        body: JSON.stringify({ properties: [status, { id: crypto.randomUUID(), name: 'Date', type: 'date' }], view: 'table', groupBy: status.id }),
      });
      note.mutate((current) => ({ ...current, database: true }));
      return '';
    }, 'Could not turn the page into a database');
  }

  function setValue(propertyId: string, value: unknown) {
    void setting.run(async () => {
      const saved = await auth.request<{ values: PropertyValues }>(`/notes/${details.id}/properties`, {
        method: 'PATCH',
        body: JSON.stringify({ values: { [propertyId]: value } }),
      });
      note.mutate((current) => ({ ...current, row: current.row && { ...current.row, values: saved.values } }));
      return '';
    }, 'Could not save that');
  }

  return (
    <article className={`page-enter grid gap-6 ${details.kind === 'board' || wide ? 'max-w-none' : details.database ? 'database-page max-w-6xl' : 'max-w-3xl'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex flex-wrap items-center gap-4">
          {details.editable && details.kind !== 'board' && (
            <button
              className="text-button text-sm"
              disabled={converting.busy}
              onClick={() => (details.database ? setUnconverting(true) : turnIntoDatabase())}
              type="button"
            >
              {details.database ? 'Turn back into a page' : 'Turn into a database'}
            </button>
          )}
          {details.editable && details.kind !== 'board' && (
            <button
              className="text-button text-sm"
              disabled={marking.busy}
              onClick={() =>
                void marking.run(async () => {
                  const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify({ template: !details.template }) });
                  note.mutate((current) => ({ ...current, ...saved }));
                  return saved.template ? 'New pages in this space can start from this one.' : 'This page is no longer a template.';
                }, 'Could not change the page')
              }
              type="button"
            >
              {details.template ? 'Stop using as a template' : 'Use as a template'}
            </button>
          )}
          {details.kind !== 'board' && !details.database && (
            <button className="text-button text-sm" onClick={toggleWide} type="button">
              {wide ? 'Standard width' : 'Full width'}
            </button>
          )}
          {details.editable && <ShareLinks itemId={details.id} key={`share-${details.id}`} noun={details.kind === 'board' ? 'board' : 'page'} />}
          <button className="text-button text-sm" onClick={() => setHistory(true)} type="button">
            History
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
      {(details.editable || details.icon) &&
        (details.editable ? <IconPicker icon={details.icon} onPick={setIcon} /> : <span className="page-icon">{details.icon}</span>)}
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
      </div>
      {details.row && details.row.properties.length > 0 && (
        <dl aria-label="Properties" className="m-0 grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-x-4 gap-y-1 text-sm">
          {details.row.properties.map((property) => (
            <Fragment key={property.id}>
              <dt className="text-muted">{property.name}</dt>
              <dd className="m-0">
                <PropertyField
                  editable={details.editable}
                  members={members.data ?? []}
                  onChange={(value) => setValue(property.id, value)}
                  property={property}
                  value={details.row!.values[property.id]}
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <Suspense fallback={<LinesSkeleton label="Loading the editor" lines={6} />}>
        {details.kind === 'board' ? (
          <BoardCanvas editable={details.editable} key={details.id} noteId={details.id} spaceId={details.spaceId} />
        ) : (
          <NoteEditor
            commentedBlocks={commentedBlocks}
            editable={details.editable}
            key={details.id}
            noteId={details.id}
            onComment={(block) => {
              setQuoting({ ...block, noteId: details.id });
              window.setTimeout(() => document.querySelector('section[aria-label="Comments"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            }}
            spaceId={details.spaceId}
          />
        )}
      </Suspense>
      {details.database && <DatabaseView editable={details.editable} key={details.id} noteId={details.id} spaceId={details.spaceId} />}
      {details.kind !== 'board' && !details.database && (children.length > 0 || details.editable) && (
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
      {backlinks.length > 0 && (
        <section className="grid gap-2 border-t border-line-soft pt-6">
          <h2 className="m-0 text-sm font-medium text-muted">Linked from</h2>
          <ul className="m-0 grid list-none gap-1 p-0">
            {backlinks.map(({ id: linkId, item }) => (
              <li key={linkId}>
                <Link className="text-ink no-underline hover:underline" to={itemHref(item) ?? `/spaces/${item.spaceId}`}>
                  {noteTitle(item)}
                </Link>
                <span className="mono-sm text-faint"> · {item.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <NoteComments
        editable={details.editable}
        key={`comments-${details.id}`}
        noteId={details.id}
        onBlocks={setCommentedBlocks}
        onQuoteDone={() => setQuoting(undefined)}
        owner={space?.role === 'owner'}
        quoting={quoting?.noteId === details.id ? quoting : undefined}
      />
      {unconverting && (
        <ConfirmDialog
          confirmLabel="Turn back into a page"
          errorFallback="Could not change the page"
          onClose={() => setUnconverting(false)}
          onConfirm={async () => {
            await auth.request(`/notes/${details.id}/database`, { method: 'DELETE' });
            note.mutate((current) => ({ ...current, database: false }));
            setUnconverting(false);
          }}
          title="Turn back into a page?"
        >
          <p className="m-0 text-sm text-muted">The pages inside stay, but the values of their properties are deleted.</p>
        </ConfirmDialog>
      )}
      {history && <NoteHistory editable={details.editable} noteId={details.id} onClose={() => setHistory(false)} />}
    </article>
  );
}
