import type * as Y from 'yjs';
import { boardElementsKey } from './document-text';

interface BoardShape {
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  opacity?: number;
  roundness?: unknown;
  points?: unknown;
  text?: string;
  fontSize?: number;
  lineHeight?: number;
  textAlign?: string;
  index?: string | null;
  isDeleted?: boolean;
}

const maxThumbnailBytes = 512 * 1024;
const maxStrokePoints = 96;
const boxTypes = new Set(['rectangle', 'frame', 'magicframe', 'image', 'embeddable', 'iframe']);
const lineTypes = new Set(['line', 'arrow', 'freedraw']);

const finite = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const round = (value: number) => Math.round(value * 10) / 10;
const paint = (value: unknown, fallback: string) => (typeof value === 'string' && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value) ? value : fallback);
const escaped = (text: string) => text.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!);

function pointsOf(shape: BoardShape) {
  if (!Array.isArray(shape.points)) return [];
  const points = shape.points.filter((point): point is [number, number] => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  const step = Math.ceil(points.length / maxStrokePoints);
  return step <= 1 ? points : points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

function boundsOf(shape: BoardShape): [number, number, number, number] {
  const x = finite(shape.x);
  const y = finite(shape.y);
  if (lineTypes.has(shape.type ?? '')) {
    const points = pointsOf(shape);
    if (points.length === 0) return [x, y, x, y];
    return [x + Math.min(...points.map(([px]) => px)), y + Math.min(...points.map(([, py]) => py)), x + Math.max(...points.map(([px]) => px)), y + Math.max(...points.map(([, py]) => py))];
  }
  const width = finite(shape.width);
  const height = finite(shape.height);
  return [Math.min(x, x + width), Math.min(y, y + height), Math.max(x, x + width), Math.max(y, y + height)];
}

function render(shape: BoardShape) {
  const [left, top, right, bottom] = boundsOf(shape);
  const width = right - left;
  const height = bottom - top;
  const stroke = paint(shape.strokeColor, '#1e1e1e');
  const background = paint(shape.backgroundColor, 'transparent');
  const fill = background === 'transparent' ? 'none' : background;
  const fillOpacity = fill !== 'none' && shape.fillStyle !== 'solid' ? ' fill-opacity="0.5"' : '';
  const strokeWidth = Math.max(1, finite(shape.strokeWidth, 2));
  const opacity = Math.min(100, Math.max(0, finite(shape.opacity, 100))) / 100;
  const angle = finite(shape.angle);
  const attributes = `${opacity < 1 ? ` opacity="${round(opacity)}"` : ''}${angle ? ` transform="rotate(${round((angle * 180) / Math.PI)} ${round(left + width / 2)} ${round(top + height / 2)})"` : ''}`;
  const outline = `stroke="${stroke}" stroke-width="${round(strokeWidth)}"`;
  if (shape.type === 'image') return `<rect x="${round(left)}" y="${round(top)}" width="${round(width)}" height="${round(height)}" fill="#e9ecef" stroke="#ced4da"${attributes}/>`;
  if (boxTypes.has(shape.type ?? '')) {
    const radius = shape.roundness ? Math.min(32, Math.min(width, height) * 0.25) : 0;
    return `<rect x="${round(left)}" y="${round(top)}" width="${round(width)}" height="${round(height)}"${radius ? ` rx="${round(radius)}"` : ''} fill="${shape.type === 'rectangle' ? fill : 'none'}"${fillOpacity} ${outline}${attributes}/>`;
  }
  if (shape.type === 'ellipse') return `<ellipse cx="${round(left + width / 2)}" cy="${round(top + height / 2)}" rx="${round(width / 2)}" ry="${round(height / 2)}" fill="${fill}"${fillOpacity} ${outline}${attributes}/>`;
  if (shape.type === 'diamond') {
    const corners = [[left + width / 2, top], [right, top + height / 2], [left + width / 2, bottom], [left, top + height / 2]];
    return `<polygon points="${corners.map(([px, py]) => `${round(px!)},${round(py!)}`).join(' ')}" fill="${fill}"${fillOpacity} ${outline}${attributes}/>`;
  }
  if (lineTypes.has(shape.type ?? '')) {
    const points = pointsOf(shape).map(([px, py]) => [finite(shape.x) + px, finite(shape.y) + py] as const);
    if (points.length < 2) return '';
    const freedraw = shape.type === 'freedraw';
    const line = `<polyline points="${points.map(([px, py]) => `${round(px)},${round(py)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${round(freedraw ? strokeWidth * 2.5 : strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${attributes}/>`;
    if (shape.type !== 'arrow') return line;
    const [tipX, tipY] = points.at(-1)!;
    const [fromX, fromY] = points.at(-2)!;
    const direction = Math.atan2(tipY - fromY, tipX - fromX);
    const barb = (side: number) => `${round(tipX - 14 * Math.cos(direction + side))},${round(tipY - 14 * Math.sin(direction + side))}`;
    return `${line}<polyline points="${barb(Math.PI / 7)} ${round(tipX)},${round(tipY)} ${barb(-Math.PI / 7)}" fill="none" ${outline} stroke-linecap="round" stroke-linejoin="round"${attributes}/>`;
  }
  if (shape.type === 'text' && typeof shape.text === 'string' && shape.text.trim()) {
    const size = Math.max(1, finite(shape.fontSize, 20));
    const lineHeight = size * finite(shape.lineHeight, 1.25);
    const anchor = shape.textAlign === 'center' ? 'middle' : shape.textAlign === 'right' ? 'end' : 'start';
    const x = round(anchor === 'middle' ? left + width / 2 : anchor === 'end' ? right : left);
    const lines = shape.text.split('\n').map((text, index) => `<tspan x="${x}" y="${round(top + size + index * lineHeight)}">${escaped(text)}</tspan>`);
    return `<text font-family="sans-serif" font-size="${round(size)}" text-anchor="${anchor}" fill="${stroke}"${attributes}>${lines.join('')}</text>`;
  }
  return '';
}

export function boardThumbnail(document: Y.Doc) {
  const shapes = [...document.getMap<BoardShape>(boardElementsKey).values()]
    .filter((shape) => shape && !shape.isDeleted && shape.type !== 'selection')
    .sort((a, b) => ((a.index ?? '') < (b.index ?? '') ? -1 : (a.index ?? '') > (b.index ?? '') ? 1 : 0));
  if (shapes.length === 0) return '';
  const bounds = shapes.map(boundsOf);
  const left = Math.min(...bounds.map(([x]) => x));
  const top = Math.min(...bounds.map(([, y]) => y));
  const width = Math.max(...bounds.map(([, , x]) => x)) - left;
  const height = Math.max(...bounds.map(([, , , y]) => y)) - top;
  const padding = Math.max(10, Math.max(width, height) * 0.04);
  const box = [left - padding, top - padding, width + padding * 2, height + padding * 2].map(round);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" width="${box[2]}" height="${box[3]}"><rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#ffffff"/>`];
  let size = parts[0]!.length + 6;
  for (const shape of shapes) {
    const part = render(shape);
    if (size + part.length > maxThumbnailBytes) break;
    parts.push(part);
    size += part.length;
  }
  return `${parts.join('')}</svg>`;
}
