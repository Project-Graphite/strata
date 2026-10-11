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
