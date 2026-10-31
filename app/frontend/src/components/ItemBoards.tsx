import { Link } from 'react-router';
import { useAuth } from '../auth';
import { noteTitle } from '../notes';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { BoardPreview } from './BoardPreview';
import { AddButton } from './Button';
import { Section } from './Page';

interface Linked {
  id: string;
  kind: string;
  item: { id: string; spaceId: string; kind: string; title: string };
}

export function useItemBoards(itemId: string) {
  const auth = useAuth();
  const links = useResource<{ outgoing: Linked[] }>(`/items/${itemId}/links`, true);
  const adding = useAction();
  return {
    boards: (links.data?.outgoing ?? []).filter((link) => link.kind === 'reference' && link.item.kind === 'board'),
    loaded: Boolean(links.data),
    busy: adding.busy,
    add: (spaceId: string, title: string) =>
      void adding.run(async () => {
        const board = await auth.request<{ id: string }>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify({ board: true, title: `${title} board` }) });
        await auth.request(`/items/${itemId}/links`, { method: 'POST', body: JSON.stringify({ targetId: board.id, kind: 'reference' }) });
        links.reload();
        return `Added ${title} board.`;
      }, 'Could not add a board'),
  };
}

export function ItemBoards({ boards, editable, spaceId, title }: { boards: ReturnType<typeof useItemBoards>; editable: boolean; spaceId: string; title: string }) {
  return (
    <Section action={editable && <AddButton disabled={boards.busy} label="New board" onClick={() => boards.add(spaceId, title)} />} title="Boards">
      {boards.boards.map(({ id, item }) => (
        <div className="grid gap-1.5" key={id}>
          <BoardPreview boardId={item.id} label={`Preview of ${noteTitle(item)}`} />
          <Link to={`/boards/${item.id}`}>
            Open {noteTitle(item)}
          </Link>
        </div>
      ))}
    </Section>
  );
}
