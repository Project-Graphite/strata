import { useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import { Skeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { boardImage } from './board-files';

export function BoardPreview({ boardId, label }: { boardId: string; label: string }) {
  const auth = useAuth();
  const frame = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'empty' | 'shown' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { elements } = await auth.request<{ elements: ExcalidrawElement[] }>(`/notes/${boardId}/board`);
      if (elements.length === 0) return 'empty' as const;
      const [{ exportToSvg }, images] = await Promise.all([
        import('@excalidraw/excalidraw'),
        Promise.all(
          elements.flatMap((element) => (element.type === 'image' && element.fileId ? [boardImage(auth.request, element.fileId).catch(() => null)] : [])),
        ),
      ]);
      const files: BinaryFiles = Object.fromEntries(images.flatMap((file) => (file ? [[file.id, file]] : [])));
      const svg = await exportToSvg({ elements, appState: { exportBackground: true, viewBackgroundColor: '#ffffff' }, files });
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      if (!cancelled) frame.current?.replaceChildren(svg);
      return 'shown' as const;
    })().then(
      (next) => !cancelled && setState(next),
      () => !cancelled && setState('failed'),
    );
    return () => {
      cancelled = true;
    };
  }, [auth.request, boardId]);

  return (
    <div aria-label={label} className="board-preview" role="img">
      {state === 'loading' && <Skeleton className="h-40 w-full" />}
      {state === 'empty' && <p className="m-0 p-6 text-center text-sm text-muted">Nothing drawn yet</p>}
      {state === 'failed' && <p className="m-0 p-6 text-center text-sm text-muted">This board could not be shown</p>}
      <div className="board-preview-drawing" ref={frame} />
    </div>
  );
}
