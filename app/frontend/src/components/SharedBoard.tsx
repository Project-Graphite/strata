import { useEffect, useState } from 'react';
import { LinesSkeleton } from '@project-graphite/ui';
import { LiveBoard } from './BoardCanvas';
import { ClosedShareLink } from './ClosedShareLink';
import { useLiveDocument } from './live-document';

export default function SharedBoard({ boardId, code, editable }: { boardId: string; code: string; editable: boolean }) {
  const connection = useLiveDocument(boardId, code);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!connection) return;
    const shut = () => {
      setClosed(true);
      connection.provider.disconnect();
    };
    const onRefused = ({ reason }: { reason: string }) => {
      if (reason !== 'outdated') shut();
    };
    const onClosed = ({ event }: { event: { reason: string } }) => {
      if (event.reason === 'Access changed') shut();
    };
    connection.provider.on('authenticationFailed', onRefused);
    connection.provider.on('close', onClosed);
    return () => {
      connection.provider.off('authenticationFailed', onRefused);
      connection.provider.off('close', onClosed);
    };
  }, [connection]);

  if (closed) return <ClosedShareLink />;
  if (!connection) return <LinesSkeleton label="Loading the board" lines={6} />;
  return <LiveBoard boardId={boardId} connection={connection} editable={editable} />;
}
