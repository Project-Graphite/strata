import { Link, useNavigate } from 'react-router';
import { EmptyState, Icon, ListSkeleton } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { LoadError } from '../../components/LoadError';
import { flattenTree, noteTitle, type Note } from '../../notes';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

export function SpaceNotes() {
  const auth = useAuth();
  const space = useSpace();
  const navigate = useNavigate();
  const notes = useResource<Note[]>(`/spaces/${space.id}/notes`, true);
  const creating = useAction();
  const editable = space.role !== 'viewer';

  if (notes.error) return <LoadError error={notes.error} onRetry={notes.reload} />;
  if (!notes.data) return <ListSkeleton label="Loading the pages in this space" rows={4} />;
  const branches = flattenTree(notes.data);

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      {editable && (
        <button
          className="primary-button w-fit px-3 py-2 text-sm"
          disabled={creating.busy}
          onClick={() =>
            void creating.run(async () => {
              const created = await auth.request<Note>(`/spaces/${space.id}/notes`, { method: 'POST', body: JSON.stringify({}) });
              navigate(`/notes/${created.id}`);
              return '';
            }, 'Could not create the page')
          }
          type="button"
        >
          <Icon name="plus" size={16} />
          New page
        </button>
      )}
      {branches.length === 0 ? (
        <EmptyState title="No pages yet" />
      ) : (
        <ul className="panel-rows m-0 grid list-none p-0">
          {branches.map(({ note, depth }) => (
            <li key={note.id}>
              <Link
                className="flex items-center gap-2 py-3 pr-4 text-ink no-underline hover:bg-line-soft"
                style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
                to={`/notes/${note.id}`}
              >
                <span aria-hidden="true" className="w-5 shrink-0 text-center">
                  {note.icon ?? '·'}
                </span>
                <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
                {note.pinnedAt && <span className="text-xs text-faint">Pinned</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
