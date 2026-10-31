import { Link, useNavigate } from 'react-router';
import { Card, Placeholder, Skeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { BoardPreview } from '../components/BoardPreview';
import { AddButton, Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { Page } from '../components/Page';
import { RowText } from '../components/RowText';
import { noteEdited, noteHref, noteTitle, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

export function BoardsIndex() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const listed = useResource<Note[]>('/me/notes?kind=board', true, { live: ['page-details', 'pages', 'items', 'spaces'] });
  const creating = useAction();
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const spaceNames = new Map(spaces.data?.map((space) => [space.id, space.name]));
  const moveToTrash = useMovePageToTrash(listed.reload, listed.reload);

  function create(spaceId: string) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify({ board: true }) });
      navigate(noteHref(created));
      return '';
    }, 'Could not create the board');
  }

  return (
    <Page actions={writable.length > 0 && <AddButton disabled={creating.busy} label="New board" large onClick={() => create(writable[0]!.id)} primary />} title="Boards">
      {listed.error ? (
        <LoadError error={listed.error} onRetry={listed.reload} />
      ) : !listed.data ? (
        <Placeholder label="Loading your boards">
          <ul className="board-grid">
            {[0, 1, 2].map((index) => (
              <li key={index}>
                <Skeleton className="board-card-skeleton" />
              </li>
            ))}
          </ul>
        </Placeholder>
      ) : listed.data.length === 0 ? (
        <Empty
          action={writable.length > 0 && <Button disabled={creating.busy} icon="plus" label="New board" onClick={() => create(writable[0]!.id)} primary />}
          icon="board"
          title="No boards yet"
          variant="page"
        >
          A board is a blank canvas to draw, sketch and plan on together.
        </Empty>
      ) : (
        <ul className="board-grid">
          {listed.data.map((board) => (
            <Card as="li" className="board-card" interactive key={board.id} padding="sm">
              <Link className="board-card-link" to={noteHref(board)}>
                <BoardPreview boardId={board.id} label={`Preview of ${noteTitle(board)}`} />
                <RowText detail={[spaceNames.get(board.spaceId), noteEdited(board)].filter(Boolean).join(' · ')} title={noteTitle(board)} />
              </Link>
              {writable.some((space) => space.id === board.spaceId) && (
                <span className="board-card-menu">
                  <ActionsMenu items={[{ label: 'Move to trash', onSelect: () => moveToTrash(board, 0) }]} name={noteTitle(board)} />
                </span>
              )}
            </Card>
          ))}
        </ul>
      )}
    </Page>
  );
}
