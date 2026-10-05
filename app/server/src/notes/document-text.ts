import * as Y from 'yjs';

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

export function documentText(document: Y.Doc, maxLength = 100_000) {
  return textOf(document.getXmlFragment('default')).replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
}

function collect(node: Y.XmlElement | Y.XmlFragment, found: { mentions: Set<string>; files: Set<string> }) {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === 'mention' && child.getAttribute('id')) found.mentions.add(String(child.getAttribute('id')));
    if (child.nodeName === 'image' && child.getAttribute('fileId')) found.files.add(String(child.getAttribute('fileId')));
    collect(child, found);
  }
  return found;
}

export function documentLinks(document: Y.Doc) {
  return collect(document.getXmlFragment('default'), { mentions: new Set<string>(), files: new Set<string>() });
}
