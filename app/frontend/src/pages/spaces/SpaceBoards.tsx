import { AddButton } from '../../components/Button';
import { usePagePrimary } from '../../components/Page';
import { BoardGrid, useCreateBoard } from '../BoardsIndex';

export function SpaceBoards() {
  const creating = useCreateBoard();
  usePagePrimary(creating.create && <AddButton disabled={creating.busy} label="New board" large onClick={creating.create} primary />);
  return <BoardGrid />;
}
