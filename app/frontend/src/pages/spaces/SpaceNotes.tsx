import { Link, useNavigate } from 'react-router';
import { EmptyState, Icon, ListSkeleton, Menu } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { LoadError } from '../../components/LoadError';
import { builtInTemplates, flattenTree, noteTitle, type Note } from '../../notes';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

function PageRow({ depth = 0, note }: { depth?: number; note: Note }) {
  return (
    <li>
      <Link
        className="flex items-center gap-2 py-3 pr-4 text-ink no-underline hover:bg-line-soft"
        style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
        to={`/notes/${note.id}`}
      >
        <span aria-hidden="true" className="w-5 shrink-0 text-center">
          {note.icon ?? '·'}
        </span>
        <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
        {note.kind === 'board' && <span className="text-xs text-faint">Board</span>}
        {note.pinnedAt && <span className="text-xs text-faint">Pinned</span>}
      </Link>
    </li>
  );
}

export function SpaceNotes() {
  const auth = useAuth();
  const space = useSpace();
  const navigate = useNavigate();
  const notes = useResource<Note[]>(`/spaces/${space.id}/notes`, true);
  const creating = useAction();
  const editable = space.role !== 'viewer';

  if (notes.error) return <LoadError error={notes.error} onRetry={notes.reload} />;
  if (!notes.data) return <ListSkeleton label="Loading the pages in this space" rows={4} />;
  const pages = notes.data.filter((note) => !note.template);
  const templates = notes.data.filter((note) => note.template);
  const branches = flattenTree(pages);

  function create(body: Record<string, string | boolean>) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${space.id}/notes`, { method: 'POST', body: JSON.stringify(body) });
      navigate(`/notes/${created.id}`);
      return '';
    }, 'Could not create the page');
  }

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="primary-button px-3 py-2 text-sm" disabled={creating.busy} onClick={() => create({})} type="button">
            <Icon name="plus" size={16} />
            New page
          </button>
          <button className="secondary-button px-3 py-2 text-sm" disabled={creating.busy} onClick={() => create({ board: true })} type="button">
            New board
          </button>
          <Menu
            items={[
              ...builtInTemplates.map(([template, label]) => ({ label, onSelect: () => create({ template, title: label }) })),
              ...templates.map((note, index) => ({ label: noteTitle(note), onSelect: () => create({ fromNoteId: note.id, title: note.title }), separated: index === 0 })),
            ]}
            label="Templates"
            trigger="From a template"
            triggerClassName="secondary-button px-3 py-2 text-sm"
            triggerLabel="Start a page from a template"
          />
        </div>
      )}
      {branches.length === 0 ? (
        <EmptyState title="No pages yet" />
      ) : (
        <ul className="panel-rows m-0 grid list-none p-0">
          {branches.map(({ note, depth }) => (
            <PageRow depth={depth} key={note.id} note={note} />
          ))}
        </ul>
      )}
      {templates.length > 0 && (
        <section className="grid gap-2">
          <h2 className="m-0 text-sm font-medium text-muted">Templates in this space</h2>
          <ul className="panel-rows m-0 grid list-none p-0">
            {templates.map((note) => (
              <PageRow key={note.id} note={note} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
