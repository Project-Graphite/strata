import { Link } from 'react-router';
import { Icon } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { noteTitle } from '../notes';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { BoardPreview } from './BoardPreview';

interface Linked {
  id: string;
  kind: string;
  item: { id: string; spaceId: string; kind: string; title: string };
}

export function ItemBoards({ editable, itemId, spaceId, title }: { editable: boolean; itemId: string; spaceId: string; title: string }) {
  const auth = useAuth();
  const links = useResource<{ outgoing: Linked[] }>(`/items/${itemId}/links`, true);
  const adding = useAction();
  const boards = (links.data?.outgoing ?? []).filter((link) => link.kind === 'reference' && link.item.kind === 'board');
  if (!links.data || (boards.length === 0 && !editable)) return null;

  return (
    <section className="grid gap-3">
      <h2 className="m-0 text-xl font-medium">Boards</h2>
      {boards.length === 0 && <p className="m-0 text-sm text-muted">Sketch a seating plan, a schedule or ideas on a shared whiteboard.</p>}
      {boards.map(({ id, item }) => (
        <div className="grid gap-1.5" key={id}>
          <BoardPreview boardId={item.id} label={`Preview of ${noteTitle(item)}`} />
          <Link className="text-sm" to={`/notes/${item.id}`}>
            Open {noteTitle(item)}
          </Link>
        </div>
      ))}
      {editable && (
        <button
          className="secondary-button w-fit px-3 py-2 text-sm"
          disabled={adding.busy}
          onClick={() =>
            void adding.run(async () => {
              const board = await auth.request<{ id: string }>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify({ board: true, title: `${title} board` }) });
              await auth.request(`/items/${itemId}/links`, { method: 'POST', body: JSON.stringify({ targetId: board.id, kind: 'reference' }) });
              links.reload();
              return '';
            }, 'Could not add a board')
          }
          type="button"
        >
          <Icon name="plus" size={16} />
          Add a board
        </button>
      )}
    </section>
  );
}
