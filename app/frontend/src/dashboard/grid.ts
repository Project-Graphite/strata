import { widgetKinds, type PlacedWidget, type Widget, type WidgetSize, type WidgetType } from './widgets';

export const gridColumns = 12;
export const rowPixels = 8;
export const gapPixels = 16;
export const minRows = 4;
export const minColumns = 2;

export const sizeWidths: Record<WidgetSize, number> = { small: 3, medium: 6, wide: 9, full: 12 };

export interface Cell {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rowsFor = (pixels: number) => Math.max(minRows, Math.ceil((pixels + gapPixels) / (rowPixels + gapPixels)));

const overlaps = (a: Cell, b: Cell) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function arrange(cells: Cell[], free: boolean, leading?: string): Cell[] {
  const rank = (cell: Cell) => Number(cell.id === leading);
  const ordered = [...cells].sort((a, b) => (free ? rank(b) - rank(a) : 0) || a.y - b.y || rank(b) - rank(a) || a.x - b.x);
  const settled: Cell[] = [];
  for (const cell of ordered) {
    const next = { ...cell, y: free ? cell.y : 0 };
    for (let blocker = settled.find((other) => overlaps(next, other)); blocker; blocker = settled.find((other) => overlaps(next, other))) {
      next.y = blocker.y + blocker.h;
    }
    settled.push(next);
  }
  return settled;
}

export function placed(widgets: Widget[]): PlacedWidget[] {
  let x = 0;
  let row = 0;
  return widgets.filter((widget) => widget.type in widgetKinds).map((widget) => {
    if (widget.x !== undefined && widget.y !== undefined && widget.w !== undefined) return { ...widget, x: widget.x, y: widget.y, w: widget.w };
    const w = sizeWidths[widget.size ?? 'medium'];
    if (x + w > gridColumns) {
      x = 0;
      row += 1;
    }
    const at = { ...widget, size: undefined, x, y: row, w };
    x += w;
    return at;
  });
}

export function inOrder<T extends Pick<Cell, 'x' | 'y'>>(cells: T[]) {
  return [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
}

const phonePriority: WidgetType[] = ['today', 'agenda', 'tasks', 'payments', 'spending', 'inbox', 'capture'];

export function phoneOrder<T extends Pick<PlacedWidget, 'type' | 'x' | 'y'>>(widgets: T[]) {
  const rank = (widget: T) => (phonePriority.includes(widget.type) ? phonePriority.indexOf(widget.type) : phonePriority.length);
  return inOrder(widgets).sort((a, b) => rank(a) - rank(b));
}

export const pixelsOf = (rows: number) => rows * (rowPixels + gapPixels) - gapPixels;
