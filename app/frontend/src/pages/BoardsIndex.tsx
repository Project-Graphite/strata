import { Link, useNavigate } from 'react-router';
import { Card, Placeholder, Skeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { PageActionsMenu } from '../components/PageActionsMenu';
import { BoardPreview } from '../components/BoardPreview';
import { AddButton, Button } from '../components/Button';
import { Drafts } from '../components/Drafts';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { Page } from '../components/Page';
import { RowText } from '../components/RowText';
import { boardsTabs, noteEdited, noteHref, noteTitle, type Note } from '../notes';
import { homePath, useChosenSpace } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

export function useCreateBoard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { spaceId, editable } = useChosenSpace();
  const creating = useAction();
  const create = () =>
    void creating.run(async () => {
      const created = await auth.request<Note>(homePath(spaceId, 'notes'), { method: 'POST', body: JSON.stringify({ board: true }) });
      navigate(noteHref(created));
      return '';
    }, 'Could not create the board');
  return { busy: creating.busy, create: editable ? create : undefined };
}

export function BoardGrid() {
  const listed = useResource<Note[]>('/me/notes?kind=board', true, { live: ['page-details', 'pages', 'items', 'spaces'] });
  const { editable } = useChosenSpace();
  const creating = useCreateBoard();
  const moveToTrash = useMovePageToTrash(listed.reload, listed.reload);

  if (listed.error) return <LoadError error={listed.error} onRetry={listed.reload} />;
  if (!listed.data) {
    return (
      <Placeholder label="Loading your boards">
        <ul className="board-grid">
          {[0, 1, 2].map((index) => (
            <li key={index}>
              <Skeleton className="board-card-skeleton" />
            </li>
          ))}
        </ul>
      </Placeholder>
    );
  }
  if (listed.data.length === 0) {
    return (
      <Empty action={creating.create && <Button disabled={creating.busy} icon="plus" label="New board" onClick={creating.create} primary />} icon="board" title="No boards yet" variant="page">
        A board is a blank canvas to draw, sketch and plan on together.
      </Empty>
    );
  }
  return (
    <ul className="board-grid">
      {listed.data.map((board) => (
        <Card as="li" className="board-card" interactive key={board.id} padding="sm">
          <Link className="board-card-link" to={noteHref(board)}>
            <BoardPreview boardId={board.id} label={`Preview of ${noteTitle(board)}`} />
            <RowText detail={noteEdited(board)} title={noteTitle(board)} />
          </Link>
          <span className="board-card-menu">
            <PageActionsMenu note={board} onTrash={editable ? () => moveToTrash(board, 0) : undefined} />
          </span>
        </Card>
      ))}
    </ul>
  );
}

export function BoardsIndex({ section }: { section: 'boards' | 'drafts' }) {
  const creating = useCreateBoard();

  return (
    <Page actions={creating.create && <AddButton disabled={creating.busy} label="New board" large onClick={creating.create} primary />} tabs={boardsTabs(section)} title="Boards">
      {section === 'drafts' ? <Drafts kind="board" /> : <BoardGrid />}
    </Page>
  );
}
