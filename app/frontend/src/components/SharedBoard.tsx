import { LinesSkeleton } from '@project-graphite/ui';
import { LiveBoard } from './BoardCanvas';
import { ClosedShareLink } from './ClosedShareLink';
import { useLiveDocument } from './live-document';

export default function SharedBoard({ boardId, code, editable, onTitle, title }: { boardId: string; code: string; editable: boolean; onTitle: (title: string) => void; title: string }) {
  const connection = useLiveDocument(boardId, { shareCode: code, onTitle });
  if (connection?.refused === 'closed') return <ClosedShareLink />;
  if (!connection) return <LinesSkeleton label="Loading the board" lines={6} />;
  return (
    <div className="board-area">
      <LiveBoard bar={{ title: <h1 className="board-title min-w-0 flex-1 truncate">{title}</h1> }} boardId={boardId} connection={connection} editable={editable} />
    </div>
  );
}
