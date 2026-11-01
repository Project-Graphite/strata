import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { IconButton } from '@project-graphite/ui';

const widthKey = 'strata-comments-width';
const minWidth = 348;
const maxWidth = 768;

function storedWidth() {
  try {
    const saved = Number(localStorage.getItem(widthKey));
    return saved >= minWidth && saved <= maxWidth ? saved : minWidth;
  } catch {
    return minWidth;
  }
}

function keepWidth(width: number) {
  try {
    localStorage.setItem(widthKey, String(width));
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
}

export function CommentsPanel({ children, docked = false, onClose, open }: { children: ReactNode; docked?: boolean; onClose: () => void; open: boolean }) {
  const [width, setWidth] = useState(storedWidth);
  const [resizing, setResizing] = useState(false);
  const [drag, setDrag] = useState(0);
  const swipe = useRef<number>(undefined);
  const closing = useRef(onClose);
  closing.current = onClose;

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closing.current();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  useEffect(() => {
    if (!docked) return;
    const root = document.documentElement.style;
    root.setProperty('--comments-docked-width', `${width}px`);
    return () => {
      root.removeProperty('--comments-docked-width');
    };
  }, [docked, width]);

  const resizeTo = (next: number) => setWidth(Math.round(Math.min(maxWidth, Math.max(minWidth, Math.min(next, window.innerWidth - 320)))));

  return (
    <>
      <div aria-hidden="true" className="comments-scrim" data-open={open} onClick={onClose} />
      <aside
        aria-label="Comments"
        className="comments-panel"
        data-docked={docked || undefined}
        data-open={open}
        data-resizing={resizing || undefined}
        inert={!open}
        style={{ '--comments-width': `${width}px`, '--comments-drag': `${drag}px` } as CSSProperties}
      >
        <div
          aria-label="Resize comments"
          aria-orientation="vertical"
          aria-valuemax={maxWidth}
          aria-valuemin={minWidth}
          aria-valuenow={width}
          className="comments-panel-resize"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = Math.min(maxWidth, Math.max(minWidth, width + (event.key === 'ArrowLeft' ? 24 : -24)));
            setWidth(next);
            keepWidth(next);
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
          onPointerMove={(event) => resizing && resizeTo(window.innerWidth - event.clientX)}
          onPointerUp={() => {
            setResizing(false);
            keepWidth(width);
          }}
          role="separator"
          tabIndex={0}
        />
        <div
          className="comments-panel-head"
          onPointerCancel={() => {
            swipe.current = undefined;
            setDrag(0);
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' || (event.target as Element).closest('button')) return;
            swipe.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => swipe.current !== undefined && setDrag(Math.max(0, event.clientY - swipe.current))}
          onPointerUp={() => {
            if (swipe.current === undefined) return;
            swipe.current = undefined;
            if (drag > 96) onClose();
            setDrag(0);
          }}
        >
          <span aria-hidden="true" className="comments-panel-grabber" />
          <h2 className="m-0 text-h3">Comments</h2>
          <IconButton icon="x" label="Close comments" onClick={onClose} />
        </div>
        <div className="comments-panel-body">{children}</div>
      </aside>
    </>
  );
}

export function CommentsButton({ count, onClick, open }: { count?: number; onClick: () => void; open: boolean }) {
  return (
    <span className="comments-button">
      <IconButton aria-pressed={open} icon="quote" label={count ? `Comments, ${count}` : 'Comments'} onClick={onClick} />
      {Boolean(count) && <span aria-hidden="true" className="comments-count">{count}</span>}
    </span>
  );
}
