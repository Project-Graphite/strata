import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { compact, gapPixels, gridColumns, inOrder, minRows, rowPixels, rowsFor, type Cell } from './grid';
import type { PlacedWidget } from './widgets';

const paddings = { compact: 'p-3', normal: 'p-4', roomy: 'p-6' };
const unmeasuredRows = 8;

interface Gesture {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  cell: Cell;
}

type Preview = Partial<Cell> & { id: string; fixed?: boolean };

export function useWide() {
  const query = '(min-width: 64rem)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

export function DashboardGrid({
  card,
  editing = false,
  label,
  onChange,
  widgets,
}: {
  card: (widget: PlacedWidget) => ReactNode;
  editing?: boolean;
  label: (widget: PlacedWidget) => string;
  onChange?: (next: PlacedWidget[]) => void;
  widgets: PlacedWidget[];
}) {
  const wide = useWide();
  const grid = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [gesture, setGesture] = useState<Gesture>();
  const [preview, setPreview] = useState<Preview>();
  const observer = useMemo(
    () =>
      new ResizeObserver((entries) =>
        setMeasured((current) => {
          let next = current;
          for (const entry of entries) {
            const node = entry.target as HTMLElement;
            const rows = rowsFor(node.offsetHeight + 4);
            if (current[node.dataset.card!] !== rows) next = { ...next, [node.dataset.card!]: rows };
          }
          return next;
        }),
      ),
    [],
  );
  useEffect(() => () => observer.disconnect(), [observer]);

  const shown = widgets.map((widget) => (preview?.id === widget.id ? { ...widget, ...preview, h: preview.fixed ? preview.h : widget.h } : widget));
  const rowsOf = (widget: PlacedWidget) => widget.h ?? measured[widget.id] ?? unmeasuredRows;
  const cells = compact(
    shown.map((widget) => ({ id: widget.id, x: widget.x, y: widget.y, w: widget.w, h: rowsOf(widget) })),
    preview?.id,
  );
  const cellOf = new Map(cells.map((cell) => [cell.id, cell]));
  const ordered = inOrder(shown.map((widget) => ({ ...widget, ...cellOf.get(widget.id)!, h: widget.h })));

  function begin(event: ReactPointerEvent<HTMLElement>, widget: PlacedWidget, mode: Gesture['mode']) {
    if (!editing || !wide || !onChange || event.button !== 0) return;
    if (mode === 'move' && (event.target as HTMLElement).closest('button, a, input, select, textarea, label, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ id: widget.id, mode, startX: event.clientX, startY: event.clientY, cell: cellOf.get(widget.id)! });
  }

  function track(event: ReactPointerEvent<HTMLElement>) {
    if (!gesture || !grid.current) return;
    const columnPitch = (grid.current.clientWidth + gapPixels) / gridColumns;
    const columns = Math.round((event.clientX - gesture.startX) / columnPitch);
    const rows = Math.round((event.clientY - gesture.startY) / (rowPixels + gapPixels));
    const { cell } = gesture;
    if (gesture.mode === 'move') {
      setPreview({ id: cell.id, x: Math.min(Math.max(cell.x + columns, 0), gridColumns - cell.w), y: Math.max(cell.y + rows, 0) });
    } else {
      setPreview({ id: cell.id, w: Math.min(Math.max(cell.w + columns, 1), gridColumns - cell.x), h: Math.max(cell.h + rows, minRows), fixed: rows !== 0 });
    }
  }

  function end() {
    if (gesture && preview && onChange) {
      onChange(
        ordered.map((widget) => {
          const original = widgets.find((candidate) => candidate.id === widget.id)!;
          const resized = preview.id === widget.id && gesture.mode === 'resize';
          return { ...original, x: widget.x, y: widget.y, w: resized ? preview.w! : original.w, h: resized && preview.fixed ? preview.h! : original.h };
        }),
      );
    }
    setGesture(undefined);
    setPreview(undefined);
  }

  return (
    <div
      className={wide ? 'dashboard-grid' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}
      onPointerCancel={end}
      onPointerMove={track}
      onPointerUp={end}
      ref={grid}
      style={wide ? { gridAutoRows: rowPixels, gap: gapPixels } : undefined}
    >
      {ordered.map((widget) => (
        <article
          aria-label={label(widget)}
          className={`dashboard-card ${widget.accent ? `card-accent tag-${widget.accent}` : ''} ${editing ? 'dashboard-card-editing' : ''} ${gesture?.id === widget.id ? 'dashboard-card-moving' : ''} ${!wide && widget.w > gridColumns / 2 ? 'md:col-span-2' : ''} ${wide && widget.h ? 'overflow-y-auto' : 'overflow-hidden'}`}
          key={widget.id}
          onPointerDown={(event) => begin(event, widget, 'move')}
          style={wide ? { gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${cellOf.get(widget.id)!.h}` } : undefined}
        >
          <div
            className={`grid min-w-0 grid-cols-1 content-start gap-3 ${paddings[widget.padding ?? 'normal']}`}
            data-card={widget.id}
            ref={(node) => {
              if (!node) return;
              observer.observe(node);
              return () => observer.unobserve(node);
            }}
          >
            {card(widget)}
          </div>
          {editing && wide && onChange && (
            <span aria-hidden="true" className="dashboard-resize" onPointerDown={(event) => begin(event, widget, 'resize')} title="Drag to resize" />
          )}
        </article>
      ))}
    </div>
  );
}
