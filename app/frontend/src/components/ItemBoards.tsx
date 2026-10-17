import { Link } from 'react-router';
import { useAuth } from '../auth';
import { noteTitle } from '../notes';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { BoardPreview } from './BoardPreview';
import { Hint } from './Hint';
import { Button } from './Button';
import { Section } from './Page';

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
    <Section
      action={
        editable && (
          <Button
            disabled={adding.busy}
            icon="plus"
            label="New board"
            onClick={() =>
              void adding.run(async () => {
                const board = await auth.request<{ id: string }>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify({ board: true, title: `${title} board` }) });
                await auth.request(`/items/${itemId}/links`, { method: 'POST', body: JSON.stringify({ targetId: board.id, kind: 'reference' }) });
                links.reload();
                return `Added ${title} board.`;
              }, 'Could not add a board')
            }
          />
        )
      }
      title="Boards"
    >
      {boards.length === 0 && <Hint>No boards yet.</Hint>}
      {boards.map(({ id, item }) => (
        <div className="grid gap-1.5" key={id}>
          <BoardPreview boardId={item.id} label={`Preview of ${noteTitle(item)}`} />
          <Link className="text-sm" to={`/notes/${item.id}`}>
            Open {noteTitle(item)}
          </Link>
        </div>
      ))}
    </Section>
  );
}
