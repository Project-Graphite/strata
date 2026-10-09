import { useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import { Skeleton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { boardImage } from './board-files';
import { useFileSource } from './file-source';

export function BoardDrawing({ elements, label }: { elements: ExcalidrawElement[]; label: string }) {
  const load = useFileSource();
  const frame = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ exportToSvg }, images] = await Promise.all([
        import('@excalidraw/excalidraw'),
        Promise.all(elements.flatMap((element) => (element.type === 'image' && element.fileId ? [boardImage(load, element.fileId).catch(() => null)] : []))),
      ]);
      const files: BinaryFiles = Object.fromEntries(images.flatMap((file) => (file ? [[file.id, file]] : [])));
      const svg = await exportToSvg({ elements, appState: { exportBackground: true, viewBackgroundColor: '#ffffff' }, files });
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      if (!cancelled) frame.current?.replaceChildren(svg);
    })().then(
      () => !cancelled && setState('shown'),
      () => !cancelled && setState('failed'),
    );
    return () => {
      cancelled = true;
    };
  }, [elements, load]);

  if (elements.length === 0) {
    return (
      <div aria-label={label} className="board-preview" role="img">
        <p className="m-0 p-6 text-center text-sm text-muted">Nothing drawn yet</p>
      </div>
    );
  }
  return (
    <div aria-label={label} className="board-preview" role="img">
      {state === 'loading' && <Skeleton className="h-40 w-full" />}
      {state === 'failed' && <p className="m-0 p-6 text-center text-sm text-muted">This board could not be shown</p>}
      <div className="board-preview-drawing" ref={frame} />
    </div>
  );
}

export function BoardPreview({ boardId, label }: { boardId: string; label: string }) {
  const auth = useAuth();
  const [elements, setElements] = useState<ExcalidrawElement[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    auth.request<{ elements: ExcalidrawElement[] }>(`/notes/${boardId}/board`).then(
      (board) => !cancelled && setElements(board.elements),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [auth.request, boardId]);

  if (failed) {
    return (
      <div aria-label={label} className="board-preview" role="img">
        <p className="m-0 p-6 text-center text-sm text-muted">This board could not be shown</p>
      </div>
    );
  }
  if (!elements) {
    return (
      <div aria-label={label} className="board-preview" role="img">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <BoardDrawing elements={elements} label={label} />;
}
