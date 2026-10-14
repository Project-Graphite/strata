import { describe, expect, it } from 'vitest';
import { compact, inOrder, pixelsFor, placed, rowsFor } from '../src/dashboard/grid';

describe('dashboard grid', () => {
  it('packs cards upward so short cards leave no holes', () => {
    expect(
      compact([
        { id: 'today', x: 0, y: 0, w: 6, h: 20 },
        { id: 'clock', x: 6, y: 0, w: 3, h: 6 },
        { id: 'weather', x: 6, y: 1, w: 3, h: 6 },
        { id: 'agenda', x: 9, y: 0, w: 3, h: 14 },
        { id: 'inbox', x: 0, y: 2, w: 12, h: 8 },
      ]),
    ).toEqual([
      { id: 'today', x: 0, y: 0, w: 6, h: 20 },
      { id: 'clock', x: 6, y: 0, w: 3, h: 6 },
      { id: 'agenda', x: 9, y: 0, w: 3, h: 14 },
      { id: 'weather', x: 6, y: 6, w: 3, h: 6 },
      { id: 'inbox', x: 0, y: 20, w: 12, h: 8 },
    ]);
  });

  it('lets a dragged card take the spot it is dropped on', () => {
    const cells = [
      { id: 'a', x: 0, y: 0, w: 6, h: 6 },
      { id: 'b', x: 0, y: 6, w: 6, h: 6 },
    ];
    expect(compact([{ ...cells[0]!, y: 7 }, cells[1]!])).toEqual([
      { id: 'b', x: 0, y: 0, w: 6, h: 6 },
      { id: 'a', x: 0, y: 6, w: 6, h: 6 },
    ]);
    expect(compact([cells[0]!, { ...cells[1]!, y: 0 }], 'b').map((cell) => [cell.id, cell.y])).toEqual([
      ['b', 0],
      ['a', 6],
    ]);
  });

  it('places layouts saved before the grid in reading order, and converts rows and pixels', () => {
    const widgets = placed([
      { id: 'clock', type: 'clock', size: 'small', settings: {} },
      { id: 'links', type: 'shortcuts', size: 'wide', settings: {} },
      { id: 'inbox', type: 'inbox', size: 'medium', settings: {} },
      { id: 'kept', type: 'quote', x: 6, y: 1, w: 6, settings: {} },
    ]);
    expect(widgets.map(({ id, x, y, w }) => ({ id, x, y, w }))).toEqual([
      { id: 'clock', x: 0, y: 0, w: 3 },
      { id: 'links', x: 3, y: 0, w: 9 },
      { id: 'inbox', x: 0, y: 1, w: 6 },
      { id: 'kept', x: 6, y: 1, w: 6 },
    ]);
    expect(inOrder(widgets.toReversed()).map((widget) => widget.id)).toEqual(['clock', 'links', 'inbox', 'kept']);
    expect(rowsFor(pixelsFor(10))).toBe(10);
    expect(rowsFor(10)).toBe(4);
  });
});
