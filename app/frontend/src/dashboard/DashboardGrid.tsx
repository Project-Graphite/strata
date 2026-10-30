import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { compact, gapPixels, gridColumns, inOrder, phoneOrder, pixelsOf, rowPixels, rowsFor, swapWithNeighbour, type Cell } from './grid';
import { useWide } from './widget-parts';
import { widgetKinds, type PlacedWidget } from './widgets';

const paddings = { compact: 'p-3', normal: 'p-4', roomy: 'p-6' };
const unmeasuredRows = 8;
const rowsKey = (dashboard: string) => `strata-card-rows-${dashboard}`;

interface Gesture {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  cells: Map<string, Cell>;
}

type Preview = Partial<Cell> & { id: string; fixed?: boolean };

function rememberedRows(dashboard: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(rowsKey(dashboard)) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function DashboardGrid({
  card,
  dashboard,
  editing = false,
  label,
  onChange,
  widgets,
}: {
  card: (widget: PlacedWidget) => ReactNode;
  dashboard: string;
  editing?: boolean;
  label: (widget: PlacedWidget) => string;
  onChange?: (next: PlacedWidget[]) => void;
  widgets: PlacedWidget[];
}) {
  const wide = useWide();
  const grid = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(() => rememberedRows(dashboard));
  const [gesture, setGesture] = useState<Gesture>();
  const [preview, setPreview] = useState<Preview>();
  const moved = useRef<string>(undefined);
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
  useEffect(() => {
    if (editing) return;
    try {
      localStorage.setItem(rowsKey(dashboard), JSON.stringify(measured));
    } catch {
      return;
    }
  }, [dashboard, editing, measured]);
  useEffect(() => {
    if (!moved.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-widget="${moved.current}"]`)?.focus();
    moved.current = undefined;
  }, [widgets]);

  const contentRows = (widget: PlacedWidget) => Math.max(measured[widget.id] ?? unmeasuredRows, widgetKinds[widget.type].minH);
  const shown = widgets.map((widget) => (preview?.id === widget.id ? { ...widget, ...preview, h: preview.fixed ? preview.h : widget.h } : widget));
  const cells = compact(
    shown.map((widget) => ({ id: widget.id, x: widget.x, y: widget.y, w: widget.w, h: Math.max(widget.h ?? 0, contentRows(widget)) })),
    preview?.id,
  );
  const cellOf = new Map(cells.map((cell) => [cell.id, cell]));
  const placedCells = shown.map((widget) => ({ ...widget, ...cellOf.get(widget.id)!, h: widget.h }));
  const ordered = wide ? inOrder(placedCells) : phoneOrder(placedCells);
  const editable = editing && wide && onChange;

  function begin(event: ReactPointerEvent<HTMLElement>, widget: PlacedWidget, mode: Gesture['mode']) {
    if (!editable || event.button !== 0 || !event.currentTarget.contains(event.target as Node)) return;
    if (mode === 'move' && (event.target as HTMLElement).closest('button, a, input, select, textarea, label, [contenteditable="true"], [role="menu"], [role="menuitem"], [role="dialog"]')) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ id: widget.id, mode, startX: event.clientX, startY: event.clientY, cells: cellOf });
  }

  function track(event: ReactPointerEvent<HTMLElement>) {
    if (!gesture || !grid.current) return;
    const columnPitch = (grid.current.clientWidth + gapPixels) / gridColumns;
    const columns = Math.round((event.clientX - gesture.startX) / columnPitch);
    const rows = Math.round((event.clientY - gesture.startY) / (rowPixels + gapPixels));
    const cell = gesture.cells.get(gesture.id)!;
    if (gesture.mode === 'move') {
      setPreview({ id: cell.id, x: Math.min(Math.max(cell.x + columns, 0), gridColumns - cell.w), y: Math.max(cell.y + rows, 0) });
    } else {
      const { minH, minW } = widgetKinds[widgets.find((widget) => widget.id === cell.id)!.type];
      setPreview({ id: cell.id, w: Math.min(Math.max(cell.w + columns, minW), gridColumns - cell.x), h: Math.max(cell.h + rows, minH), fixed: rows !== 0 });
    }
  }

  function end() {
    if (gesture && preview && onChange) {
      const next = ordered.map((widget) => {
        const original = widgets.find((candidate) => candidate.id === widget.id)!;
        const resized = preview.id === widget.id && gesture.mode === 'resize';
        return { ...original, x: widget.x, y: widget.y, w: resized ? preview.w! : original.w, h: resized && preview.fixed ? preview.h! : original.h };
      });
      const changed = next.some((widget) => {
        const before = gesture.cells.get(widget.id)!;
        return widget.x !== before.x || widget.y !== before.y || widget.w !== before.w || widget.h !== widgets.find((candidate) => candidate.id === widget.id)!.h;
      });
      if (changed) onChange(next);
    }
    setGesture(undefined);
    setPreview(undefined);
  }

  function nudge(event: KeyboardEvent<HTMLElement>, widget: PlacedWidget, mode: Gesture['mode']) {
    if (!onChange || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.target !== event.currentTarget) return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const across = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const { minH, minW } = widgetKinds[widget.type];
    const update = (fields: Partial<PlacedWidget>) => onChange(widgets.map((shown) => (shown.id === widget.id ? { ...shown, ...fields } : shown)));
    if (mode === 'resize') {
      if (across) update({ w: Math.min(Math.max(widget.w + step, minW), gridColumns - widget.x) });
      else update({ h: Math.max((widget.h ?? cellOf.get(widget.id)!.h) + step, minH) });
      return;
    }
    moved.current = widget.id;
    if (across) update({ x: Math.min(Math.max(widget.x + step, 0), gridColumns - widget.w) });
    else onChange(swapWithNeighbour(widgets, widget.id, step));
  }

  return (
    <div
      className={wide ? `dashboard-grid ${gesture ? 'dashboard-grid-guides' : ''}` : 'grid grid-cols-1 gap-4 md:grid-cols-2'}
      onPointerCancel={end}
      onPointerMove={track}
      onPointerUp={end}
      ref={grid}
      style={wide ? ({ gridAutoRows: rowPixels, gap: gapPixels, '--grid-gap': `${gapPixels}px` } as CSSProperties) : undefined}
    >
      {ordered.map((widget) => (
        <article
          aria-label={label(widget)}
          aria-roledescription={editable ? 'Movable card, use the arrow keys to move it' : undefined}
          className={`dashboard-card overflow-hidden ${widget.accent ? `card-accent tag-${widget.accent}` : ''} ${editing ? 'dashboard-card-editing' : ''} ${gesture?.id === widget.id ? 'dashboard-card-moving' : ''} ${!wide && widget.w > gridColumns / 2 ? 'md:col-span-2' : ''}`}
          data-widget={widget.id}
          key={widget.id}
          onKeyDown={editable ? (event) => nudge(event, widget, 'move') : undefined}
          onPointerDown={(event) => begin(event, widget, 'move')}
          style={
            wide
              ? { gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${cellOf.get(widget.id)!.h}` }
              : { minHeight: pixelsOf(widgetKinds[widget.type].minH) }
          }
          tabIndex={editable ? 0 : undefined}
        >
          <div
            className={`dashboard-card-body grid min-w-0 grid-cols-1 content-start gap-3 ${paddings[widget.padding ?? 'normal']}`}
            data-card={widget.id}
            ref={(node) => {
              if (!node) return;
              observer.observe(node);
              return () => observer.unobserve(node);
            }}
            style={measured[widget.id] ? ({ '--card-height': `${pixelsOf(measured[widget.id]!) - 4}px` } as CSSProperties) : undefined}
          >
            {card(widget)}
          </div>
          {editable && (
            <button
              aria-label={`Resize ${label(widget)}, use the arrow keys`}
              className="dashboard-resize"
              onKeyDown={(event) => nudge(event, widget, 'resize')}
              onPointerDown={(event) => begin(event, widget, 'resize')}
              title="Drag or use the arrow keys to resize"
              type="button"
            >
              {gesture?.id === widget.id && gesture.mode === 'resize' && (
                <span className="dashboard-resize-size">
                  {cellOf.get(widget.id)!.w} of {gridColumns} columns
                </span>
              )}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
