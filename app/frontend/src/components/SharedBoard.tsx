import { LinesSkeleton } from '@project-graphite/ui';
import { LiveBoard } from './BoardCanvas';
import { ClosedShareLink } from './ClosedShareLink';
import { useLiveDocument } from './live-document';

export default function SharedBoard({ boardId, code, editable, onTitle }: { boardId: string; code: string; editable: boolean; onTitle: (title: string) => void }) {
  const connection = useLiveDocument(boardId, { shareCode: code, onTitle });
  if (connection?.refused === 'closed') return <ClosedShareLink />;
  if (!connection) return <LinesSkeleton label="Loading the board" lines={6} />;
  return <LiveBoard boardId={boardId} connection={connection} editable={editable} />;
}
