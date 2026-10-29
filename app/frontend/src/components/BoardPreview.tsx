import { useEffect, useState } from 'react';
import { Skeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useLiveRefresh } from '../useResource';

export function BoardPreview({ boardId, label, live = false }: { boardId: string; label: string; live?: boolean }) {
  const auth = useAuth();
  const [thumbnail, setThumbnail] = useState<string | null>();
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useLiveRefresh(() => setVersion((current) => current + 1), live ? { live: ['pages'] } : undefined);

  useEffect(() => {
    let cancelled = false;
    auth.request<{ thumbnail: string | null }>(`/notes/${boardId}/board/thumbnail`).then(
      (board) => !cancelled && setThumbnail(board.thumbnail),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [auth.request, boardId, version]);

  return (
    <div aria-label={label} className="board-preview" role="img">
      {failed ? (
        <p className="m-0 p-6 text-center text-small">This board could not be shown</p>
      ) : thumbnail === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : thumbnail === null ? (
        <p className="m-0 p-6 text-center text-small">Nothing drawn yet</p>
      ) : (
        <img alt="" className="board-preview-drawing" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(thumbnail)}`} />
      )}
    </div>
  );
}
