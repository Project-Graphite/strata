import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { boardThumbnail } from '../src/notes/board-thumbnail';

function board(...elements: Record<string, unknown>[]) {
  const document = new Y.Doc();
  const map = document.getMap('board');
  for (const element of elements) map.set(String(element.id), element);
  return document;
}

describe('boardThumbnail', () => {
  it('is empty for a board with nothing drawn or only deleted shapes', () => {
    expect(boardThumbnail(new Y.Doc())).toBe('');
    expect(boardThumbnail(board({ id: 'gone', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, isDeleted: true }))).toBe('');
  });

  it('draws shapes in stacking order on a white background framed around the content', () => {
    const svg = boardThumbnail(
      board(
        { id: 'top', type: 'ellipse', x: 100, y: 100, width: 50, height: 20, index: 'a2', strokeColor: '#e03131', backgroundColor: 'transparent' },
        { id: 'bottom', type: 'rectangle', x: 0, y: 0, width: 200, height: 120, index: 'a1', backgroundColor: '#ffec99', fillStyle: 'solid', roundness: { type: 3 } },
      ),
    );
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-10 -10 220 140"/);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg.indexOf('<rect x="0"')).toBeLessThan(svg.indexOf('<ellipse'));
    expect(svg).toContain('<ellipse cx="125" cy="110" rx="25" ry="10" fill="none" stroke="#e03131"');
    expect(svg).toContain('rx="30" fill="#ffec99"');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('thins long strokes, adds arrow heads and escapes text', () => {
    const points = Array.from({ length: 2_000 }, (_, index) => [index, Math.sin(index / 50) * 40]);
    const svg = boardThumbnail(
      board(
        { id: 'stroke', type: 'freedraw', x: 0, y: 0, points, strokeWidth: 2 },
        { id: 'arrow', type: 'arrow', x: 0, y: 200, points: [[0, 0], [100, 0]] },
        { id: 'note', type: 'text', x: 0, y: 300, width: 120, height: 50, text: 'Ship <b> & "test"\nNext', fontSize: 20 },
      ),
    );
    const stroke = svg.match(/<polyline points="([^"]+)" fill="none" stroke="#1e1e1e" stroke-width="5"/)?.[1].split(' ');
    expect(stroke?.length).toBeLessThanOrEqual(100);
    expect(stroke?.at(-1)).toBe(`1999,${Math.round(Math.sin(1999 / 50) * 400) / 10}`);
    expect(svg.match(/<polyline/g)).toHaveLength(3);
    expect(svg).toContain('Ship &lt;b&gt; &amp; &quot;test&quot;</tspan><tspan x="0" y="345">Next');
  });

  it('ignores unsafe colours and stays within the size cap', () => {
    const svg = boardThumbnail(board({ id: 'box', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, strokeColor: 'red" onload="alert(1)', backgroundColor: 'url(#x)' }));
    expect(svg).not.toContain('onload');
    expect(svg).toContain('stroke="#1e1e1e"');
    const many = board(...Array.from({ length: 5_000 }, (_, index) => ({ id: `t${index}`, type: 'text', x: index, y: index, width: 400, height: 20, text: 'x'.repeat(200) })));
    expect(boardThumbnail(many).length).toBeLessThanOrEqual(512 * 1024);
  });
});
