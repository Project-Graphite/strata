import { widgetKinds, type PlacedWidget, type Widget, type WidgetSize } from './widgets';

export const gridColumns = 12;
export const rowPixels = 8;
export const gapPixels = 16;
export const minRows = 4;

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

export function compact(cells: Cell[], leading?: string): Cell[] {
  const ordered = [...cells].sort((a, b) => a.y - b.y || Number(b.id === leading) - Number(a.id === leading) || a.x - b.x);
  const settled: Cell[] = [];
  for (const cell of ordered) {
    const next = { ...cell, y: 0 };
    for (let blocker = settled.find((other) => overlaps(next, other)); blocker; blocker = settled.find((other) => overlaps(next, other))) {
      next.y = blocker.y + blocker.h;
    }
    settled.push(next);
  }
  return settled;
}

function fitted(widget: PlacedWidget): PlacedWidget {
  const { minW, minH } = widgetKinds[widget.type];
  const w = Math.min(Math.max(widget.w, minW), gridColumns);
  return { ...widget, w, x: Math.min(widget.x, gridColumns - w), h: widget.h ? Math.max(widget.h, minH) : widget.h };
}

export function placed(widgets: Widget[]): PlacedWidget[] {
  let x = 0;
  let row = 0;
  return widgets.map((widget) => {
    if (widget.x !== undefined && widget.y !== undefined && widget.w !== undefined) return fitted({ ...widget, x: widget.x, y: widget.y, w: widget.w });
    const w = sizeWidths[widget.size ?? 'medium'];
    if (x + w > gridColumns) {
      x = 0;
      row += 1;
    }
    const at = { ...widget, size: undefined, x, y: row, w };
    x += w;
    return fitted(at);
  });
}

export function inOrder<T extends Pick<Cell, 'x' | 'y'>>(cells: T[]) {
  return [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
}

const laneSplits: number[][] = (function split(left: number, lanes: number): number[][] {
  if (left === 0) return [[]];
  if (lanes === 0) return [];
  return Array.from({ length: left - 2 }, (_, index) => index + 3).flatMap((width) => split(left - width, lanes - 1).map((rest) => [width, ...rest]));
})(gridColumns, 4);

function widthCost(widget: PlacedWidget, width: number) {
  const { maxW, size } = widgetKinds[widget.type];
  return Math.abs(width - sizeWidths[size]) + 2 * Math.max(0, width - maxW);
}

export function stretched(widgets: PlacedWidget[], contentRows: (widget: PlacedWidget) => number): PlacedWidget[] {
  const lanes = new Map<string, PlacedWidget[]>();
  for (const widget of inOrder(widgets)) lanes.set(`${widget.x}/${widget.w}`, [...(lanes.get(`${widget.x}/${widget.w}`) ?? []), widget]);
  const stacks = [...lanes.values()];
  const heights = stacks.map((stack) => stack.reduce((total, widget) => total + contentRows(widget), 0));
  const tallest = Math.max(0, ...heights);
  return stacks.flatMap((stack, lane) => {
    let spare = tallest - heights[lane]!;
    let y = 0;
    return stack.map((widget, index) => {
      const rows = contentRows(widget);
      const extra = index === stack.length - 1 ? spare : Math.round((spare * rows) / stack.slice(index).reduce((total, rest) => total + contentRows(rest), 0));
      spare -= extra;
      const at = { ...widget, y, h: extra > 0 ? rows + extra : null };
      y += rows + extra;
      return at;
    });
  });
}

export function organized(widgets: PlacedWidget[], contentRows: (widget: PlacedWidget) => number): PlacedWidget[] {
  const ordered = inOrder(widgets);
  let best: { score: number; widths: number[]; lanes: PlacedWidget[][] } | undefined;
  for (const widths of laneSplits) {
    const lanes = widths.map((): PlacedWidget[] => []);
    const heights = widths.map(() => 0);
    let mismatch = 0;
    for (const widget of ordered) {
      let lane = -1;
      let cost = Infinity;
      widths.forEach((width, index) => {
        const candidate = heights[index]! + contentRows(widget) + 2 * widthCost(widget, width);
        if (width >= widgetKinds[widget.type].minW && candidate < cost) {
          cost = candidate;
          lane = index;
        }
      });
      if (lane < 0) break;
      lanes[lane]!.push(widget);
      heights[lane]! += contentRows(widget);
      mismatch += widthCost(widget, widths[lane]!) * contentRows(widget);
    }
    if (lanes.some((stack) => stack.length === 0) || lanes.flat().length < ordered.length) continue;
    const tallest = Math.max(...heights);
    const score = tallest * gridColumns + mismatch + heights.reduce((total, height, index) => total + (tallest - height) * widths[index]!, 0) / 2;
    if (!best || score < best.score) best = { score, widths, lanes };
  }
  if (!best) return widgets;
  const { lanes, widths } = best;
  let x = 0;
  const arranged = lanes.flatMap((stack, index) => {
    const at = x;
    x += widths[index]!;
    let y = 0;
    return stack.map((widget) => {
      const placedAt = { ...widget, x: at, y, w: widths[index]!, h: null };
      y += contentRows(widget);
      return placedAt;
    });
  });
  return stretched(arranged, contentRows);
}
