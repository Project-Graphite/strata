import { ItemKind } from '@prisma/client';
import * as Y from 'yjs';

export const pageKinds: ItemKind[] = [ItemKind.NOTE, ItemKind.BOARD];

const blockSeparator = '\n';

function textOf(node: Y.XmlElement | Y.XmlText | Y.XmlFragment): string {
  if (node instanceof Y.XmlText) {
    return node
      .toDelta()
      .map((part: { insert: unknown }) => (typeof part.insert === 'string' ? part.insert : ''))
      .join('');
  }
  return node
    .toArray()
    .map((child) => (child instanceof Y.XmlHook ? '' : textOf(child)))
    .filter(Boolean)
    .join(blockSeparator);
}

export const boardElementsKey = 'board';

interface BoardElement {
  type?: string;
  text?: string;
  fileId?: string;
  isDeleted?: boolean;
}

function boardElements(document: Y.Doc) {
  return [...document.getMap<BoardElement>(boardElementsKey).values()].filter((element) => !element.isDeleted);
}

export function documentText(document: Y.Doc, maxLength = 100_000) {
  const boardText = boardElements(document).flatMap((element) => (element.type === 'text' && element.text ? [element.text] : []));
  return [textOf(document.getXmlFragment('default')), ...boardText]
    .filter(Boolean)
    .join(blockSeparator)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function collect(node: Y.XmlElement | Y.XmlFragment, found: { mentions: Set<string>; files: Set<string> }) {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === 'mention' && child.getAttribute('id')) found.mentions.add(String(child.getAttribute('id')));
    if (child.nodeName === 'boardEmbed' && child.getAttribute('boardId')) found.mentions.add(String(child.getAttribute('boardId')));
    if (child.nodeName === 'image' && child.getAttribute('fileId')) found.files.add(String(child.getAttribute('fileId')));
    collect(child, found);
  }
  return found;
}

export function documentLinks(document: Y.Doc) {
  const found = collect(document.getXmlFragment('default'), { mentions: new Set<string>(), files: new Set<string>() });
  for (const element of boardElements(document)) if (element.type === 'image' && element.fileId) found.files.add(element.fileId);
  return found;
}

const linkAttributes = new Map<string, { node: string; kind: 'mentions' | 'files' }>([
  ['id', { node: 'mention', kind: 'mentions' }],
  ['boardId', { node: 'boardEmbed', kind: 'mentions' }],
  ['fileId', { node: 'image', kind: 'files' }],
]);

export function updateLinks(document: Y.Doc, update: Uint8Array) {
  const found = { mentions: new Set<string>(), files: new Set<string>() };
  const items = Y.decodeUpdate(update).structs.filter((struct): struct is Y.Item => struct instanceof Y.Item);
  const fresh = new Map(items.map((item) => [`${item.id.client}:${item.id.clock}`, item]));
  const find = (id: Y.ID) => fresh.get(`${id.client}:${id.clock}`) ?? (id.clock < Y.getState(document.store, id.client) ? Y.getItem(document.store, id) : undefined);
  const placeOf = (item: Y.Item, depth = 0): { parent: unknown; key: string | null } | undefined => {
    const parent = item.parent as unknown;
    if (parent instanceof Y.AbstractType || typeof parent === 'string') return { parent, key: item.parentSub };
    if (parent instanceof Y.ID) {
      const owner = find(parent);
      return owner instanceof Y.Item && owner.content instanceof Y.ContentType ? { parent: owner.content.type, key: item.parentSub } : undefined;
    }
    const neighbour = depth < 100 ? (item.origin ?? item.rightOrigin) : null;
    const next = neighbour ? find(neighbour) : undefined;
    return next instanceof Y.Item ? placeOf(next, depth + 1) : undefined;
  };
  for (const item of items) {
    if (!(item.content instanceof Y.ContentAny)) continue;
    const value = item.content.arr[0] as BoardElement | string | null;
    if (value && typeof value === 'object' && value.type === 'image' && typeof value.fileId === 'string' && !value.isDeleted) found.files.add(value.fileId);
    if (typeof value !== 'string' || !value) continue;
    const place = placeOf(item);
    if (!place) return undefined;
    const link = place.key === null ? undefined : linkAttributes.get(place.key);
    if (link && place.parent instanceof Y.XmlElement && place.parent.nodeName === link.node) found[link.kind].add(value);
  }
  return found;
}
