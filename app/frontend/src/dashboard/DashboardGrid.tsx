import { useEffect, useEffectEvent, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { compact, gapPixels, gridColumns, inOrder, organized, rowPixels, rowsFor, stretched, type Cell } from './grid';
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

export interface GridHandle {
  organize: () => void;
}

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

function rememberedRows(dashboard: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(rowsKey(dashboard)) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

const sameLayout = (a: PlacedWidget[], b: PlacedWidget[]) =>
  a.every((widget) => {
    const other = b.find((candidate) => candidate.id === widget.id);
    return other && other.x === widget.x && other.y === widget.y && other.w === widget.w && (other.h ?? null) === (widget.h ?? null);
  });

export function DashboardGrid({
  card,
  dashboard,
  editing = false,
  label,
  onChange,
  ref,
  widgets,
}: {
  card: (widget: PlacedWidget) => ReactNode;
  dashboard: string;
  editing?: boolean;
  label: (widget: PlacedWidget) => string;
  onChange?: (next: PlacedWidget[], replace?: boolean) => void;
  ref?: Ref<GridHandle>;
  widgets: PlacedWidget[];
}) {
  const wide = useWide();
  const grid = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(() => rememberedRows(dashboard));
  const [gesture, setGesture] = useState<Gesture>();
  const [preview, setPreview] = useState<Preview>();
  const [settling, setSettling] = useState(false);
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

  const contentRows = (widget: PlacedWidget) => Math.max(measured[widget.id] ?? unmeasuredRows, widgetKinds[widget.type].minH);
  const settle = useEffectEvent(() => {
    const next = stretched(widgets, contentRows);
    if (!sameLayout(next, widgets)) onChange?.(next, true);
  });
  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => {
      setSettling(false);
      settle();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [measured, settling]);
  useImperativeHandle(ref, () => ({
    organize() {
      const next = organized(widgets, contentRows);
      if (sameLayout(next, widgets)) return;
      onChange?.(next);
      setSettling(true);
    },
  }));

  const shown = widgets.map((widget) => (preview?.id === widget.id ? { ...widget, ...preview, h: preview.fixed ? preview.h : widget.h } : widget));
  const rowsOf = (widget: PlacedWidget) => widget.h ?? contentRows(widget);
  const cells = compact(
    shown.map((widget) => ({ id: widget.id, x: widget.x, y: widget.y, w: widget.w, h: rowsOf(widget) })),
    preview?.id,
  );
  const cellOf = new Map(cells.map((cell) => [cell.id, cell]));
  const ordered = inOrder(shown.map((widget) => ({ ...widget, ...cellOf.get(widget.id)!, h: widget.h })));

  function begin(event: ReactPointerEvent<HTMLElement>, widget: PlacedWidget, mode: Gesture['mode']) {
    if (!editing || !wide || !onChange || event.button !== 0 || !event.currentTarget.contains(event.target as Node)) return;
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
          className={`dashboard-card ${widget.accent ? `card-accent tag-${widget.accent}` : ''} ${editing ? 'dashboard-card-editing' : ''} ${gesture?.id === widget.id ? 'dashboard-card-moving' : ''} ${!wide && widget.w > gridColumns / 2 ? 'md:col-span-2' : ''} ${wide && widget.h ? 'overflow-y-auto [scrollbar-gutter:stable]' : 'overflow-hidden'}`}
          key={widget.id}
          onPointerDown={(event) => begin(event, widget, 'move')}
          style={wide ? { gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${cellOf.get(widget.id)!.h}` } : undefined}
        >
          <div
            className={`dashboard-card-body grid min-w-0 grid-cols-1 content-start gap-3 ${paddings[widget.padding ?? 'normal']}`}
            data-card={widget.id}
            ref={(node) => {
              if (!node) return;
              observer.observe(node);
              return () => observer.unobserve(node);
            }}
            style={measured[widget.id] ? ({ '--card-height': `${measured[widget.id]! * (rowPixels + gapPixels) - gapPixels - 4}px` } as CSSProperties) : undefined}
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
