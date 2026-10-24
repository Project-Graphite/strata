import { useEffect, useMemo, useState } from 'react';
import { LinesSkeleton } from '@project-graphite/ui';
import { ClosedShareLink } from './ClosedShareLink';
import { FileSourceContext, sharedFiles } from './file-source';
import { useLiveDocument } from './live-document';
import { CollaborativeEditor } from './NoteEditor';

export default function SharedDocument({ code, editable, noteId, onTitle }: { code: string; editable: boolean; noteId: string; onTitle: (title: string) => void }) {
  const connection = useLiveDocument(noteId, { shareCode: code, onTitle });
  const files = useMemo(() => sharedFiles(code), [code]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!connection) return;
    const synced = () => setReady(true);
    connection.provider.on('synced', synced);
    if (connection.provider.isSynced) synced();
    return () => {
      connection.provider.off('synced', synced);
    };
  }, [connection]);
  if (connection?.refused === 'closed') return <ClosedShareLink />;
  if (!connection || (!ready && !connection.refused)) return <LinesSkeleton label="Loading the page" lines={6} />;
  return (
    <FileSourceContext.Provider value={files}>
      <CollaborativeEditor connection={connection} editable={editable} noteId={noteId} quick={false} />
    </FileSourceContext.Provider>
  );
}
