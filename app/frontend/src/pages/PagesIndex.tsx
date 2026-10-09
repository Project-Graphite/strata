import { Link, useNavigate } from 'react-router';
import { EmptyState, Icon, ListSkeleton, Menu, PageHeader, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { LoadError } from '../components/LoadError';
import { noteTitle, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const wording = {
  board: { title: 'Boards', create: 'New board', empty: 'No boards yet', hint: 'A board is a white canvas to draw, sketch and plan on together.' },
  note: { title: 'Pages', create: 'New page', empty: 'No pages yet', hint: 'Pages hold notes, checklists, tables and anything you write.' },
};

export function PagesIndex({ kind }: { kind: 'note' | 'board' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const listed = useResource<Note[]>(`/me/notes?kind=${kind}`, true);
  const creating = useAction();
  const words = wording[kind];
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  function create(spaceId: string) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify(kind === 'board' ? { board: true } : {}) });
      navigate(`/notes/${created.id}`);
      return '';
    }, `Could not create the ${kind === 'board' ? 'board' : 'page'}`);
  }

  return (
    <section className="page-enter grid max-w-3xl gap-8">
      <PageHeader
        actions={
          writable.length === 1 ? (
            <button className="primary-button px-3 py-2 text-sm" disabled={creating.busy} onClick={() => create(writable[0]!.id)} type="button">
              <Icon name="plus" size={16} />
              {words.create}
            </button>
          ) : (
            writable.length > 1 && (
              <Menu
                items={writable.map((space) => ({ label: `In ${space.name}`, onSelect: () => create(space.id) }))}
                label="Spaces"
                trigger={words.create}
                triggerClassName="primary-button px-3 py-2 text-sm"
                triggerLabel={`${words.create}: choose a space`}
              />
            )
          )
        }
        title={words.title}
      />
      {listed.error ? (
        <LoadError error={listed.error} onRetry={listed.reload} />
      ) : !listed.data ? (
        <ListSkeleton label={`Loading your ${words.title.toLowerCase()}`} rows={4} />
      ) : listed.data.length === 0 ? (
        <EmptyState title={words.empty}>
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">{words.hint}</p>
        </EmptyState>
      ) : (
        <ul className="panel-rows m-0 grid list-none p-0">
          {listed.data.map((note) => (
            <li key={note.id}>
              <Link className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-line-soft" to={`/notes/${note.id}`}>
                <span aria-hidden="true" className="w-5 shrink-0 text-center">
                  {note.icon ?? (kind === 'board' ? '▦' : '·')}
                </span>
                <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
                <span className="mono-sm shrink-0 text-faint">
                  {spaces.data?.find((space) => space.id === note.spaceId)?.name} · {timeAgo(note.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
