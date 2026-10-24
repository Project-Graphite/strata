import * as Y from 'yjs';
import type { useAuth } from './auth';
import { editorFormat } from './editor-format';
import { encodedPageState, maxPageStateBytes, pageDraftBody } from './draft-format';

export interface DraftPart {
  id: string;
  title: string;
  body: Blob;
}

type Xml = Y.XmlFragment | Y.XmlElement | Y.XmlText;
type Division = { path: number[]; offset: number; mode: 'children' | 'text' | 'details' };

function copy(document: Y.Doc) {
  const result = new Y.Doc();
  Y.applyUpdate(result, Y.encodeStateAsUpdate(document));
  return result;
}

function at(document: Y.Doc, path: number[]): Xml {
  let node: Xml = document.getXmlFragment('default');
  for (const index of path) {
    if (node instanceof Y.XmlText) throw new Error('This block cannot be split automatically. Keep the original draft file.');
    const child = node.get(index);
    if (!(child instanceof Y.XmlElement || child instanceof Y.XmlText)) throw new Error('This block cannot be split automatically. Keep the original draft file.');
    node = child;
  }
  return node;
}

function hasContent(node: Xml): boolean {
  if (node instanceof Y.XmlText) return node.length > 0;
  if (node instanceof Y.XmlElement && ['image', 'boardEmbed', 'mention', 'horizontalRule', 'hardBreak'].includes(node.nodeName)) return true;
  return node.toArray().some((child) => child instanceof Y.XmlElement || child instanceof Y.XmlText ? hasContent(child) : true);
}

function division(node: Xml, path: number[] = []): Division | undefined {
  if (node instanceof Y.XmlText) {
    const text = node.toDelta().map((entry: { insert: unknown }) => typeof entry.insert === 'string' ? entry.insert : '\ufffc').join('');
    const segment = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text).containing(Math.floor(text.length / 2));
    const offset = segment && (segment.index || segment.segment.length);
    return offset && offset < node.length ? { path, offset, mode: 'text' } : undefined;
  }
  if (node instanceof Y.XmlElement && node.nodeName === 'details') {
    const children = node.toArray();
    if (children.length !== 2 || !(children[0] instanceof Y.XmlElement) || !(children[1] instanceof Y.XmlElement) || children[0].nodeName !== 'detailsSummary' || children[1].nodeName !== 'detailsContent') return undefined;
    if (hasContent(children[0]) && hasContent(children[1])) return { path, offset: 1, mode: 'details' };
    return division(hasContent(children[0]) ? children[0] : children[1], [...path, hasContent(children[0]) ? 0 : 1]);
  }
  if (node instanceof Y.XmlElement && ['listItem', 'taskItem'].includes(node.nodeName) && node.length > 1) {
    const first = node.get(0);
    if ((first instanceof Y.XmlElement || first instanceof Y.XmlText) && !hasContent(first)) {
      const next = node.get(1);
      if (node.length === 2 && (next instanceof Y.XmlElement || next instanceof Y.XmlText)) return division(next, [...path, 1]);
      return { path, offset: Math.max(2, Math.floor(node.length / 2)), mode: 'children' };
    }
  }
  if (node.length > 1) return { path, offset: Math.floor(node.length / 2), mode: 'children' };
  const child = node.get(0);
  return child instanceof Y.XmlElement || child instanceof Y.XmlText ? division(child, [...path, 0]) : undefined;
}

function boardGroups(document: Y.Doc) {
  const board = document.getMap<Record<string, unknown>>('board');
  const parents = new Map([...board.keys()].map((id) => [id, id]));
  const root = (id: string): string => {
    let current = id;
    while (parents.get(current) !== current) current = parents.get(current)!;
    while (id !== current) {
      const next = parents.get(id)!;
      parents.set(id, current);
      id = next;
    }
    return current;
  };
  for (const [id, element] of board) {
    if (!element || typeof element !== 'object') throw new Error('That board draft contains an invalid element. Keep the original file.');
    const references = [element.containerId, element.frameId,
      ...(Array.isArray(element.boundElements) ? element.boundElements.map((entry: { id?: unknown }) => entry?.id) : []),
      ...(element.startBinding && typeof element.startBinding === 'object' && 'elementId' in element.startBinding ? [element.startBinding.elementId] : []),
      ...(element.endBinding && typeof element.endBinding === 'object' && 'elementId' in element.endBinding ? [element.endBinding.elementId] : []),
    ];
    for (const reference of references) if (typeof reference === 'string' && parents.has(reference)) parents.set(root(reference), root(id));
  }
  const groups = new Map<string, string[]>();
  for (const id of board.keys()) {
    const key = root(id);
    const group = groups.get(key);
    if (group) group.push(id);
    else groups.set(key, [id]);
  }
  return [...groups.values()];
}

export function splitPageDraft(document: Y.Doc, kind: 'note' | 'board', maxBytes = maxPageStateBytes): Uint8Array[] {
  const split = (current: Y.Doc): Uint8Array[] => {
    const state = Y.encodeStateAsUpdate(current);
    if (state.byteLength <= maxBytes) return [state];
    const point = kind === 'note' ? division(current.getXmlFragment('default')) : undefined;
    const groups = kind === 'board' ? boardGroups(current) : undefined;
    if ((!point && !groups) || (groups && groups.length < 2)) throw new Error('A block or connected board group is too large to split automatically. Keep the original draft file.');
    const left = copy(current);
    const right = copy(current);
    try {
      if (groups) {
        const first = new Set(groups.slice(0, Math.floor(groups.length / 2)).flat());
        for (const id of left.getMap('board').keys()) if (!first.has(id)) left.getMap('board').delete(id);
        for (const id of first) right.getMap('board').delete(id);
      } else {
        const before = at(left, point!.path);
        const after = at(right, point!.path);
        if (point!.mode === 'details') {
          if (!(before instanceof Y.XmlText) && !(after instanceof Y.XmlText)) {
            const content = before.get(1) as Y.XmlElement;
            content.delete(0, content.length);
            const summary = after.get(0) as Y.XmlElement;
            summary.delete(0, summary.length);
          }
        } else {
          before.delete(point!.offset, before.length - point!.offset);
          after.delete(0, point!.offset);
          if (after instanceof Y.XmlElement && after.nodeName === 'orderedList') after.setAttribute('start', ((Number(after.getAttribute('start')) || 1) + point!.offset) as never);
          if (after instanceof Y.XmlElement && ['listItem', 'taskItem'].includes(after.nodeName) && (!(after.get(0) instanceof Y.XmlElement) || (after.get(0) as Y.XmlElement).nodeName !== 'paragraph')) after.insert(0, [new Y.XmlElement('paragraph')]);
        }
      }
      return [...split(left), ...split(right)];
    } finally {
      left.destroy();
      right.destroy();
    }
  };
  const compacted = copy(document);
  try {
    return split(compacted);
  } finally {
    compacted.destroy();
  }
}

export async function draftRecoveryParts(file: File): Promise<DraftPart[]> {
  if (file.size > 64 * 1024 * 1024) throw new Error('Automatic draft recovery accepts files up to 64 MB. Keep the original backup.');
  let draft: unknown;
  try { draft = JSON.parse(await file.text()); } catch { throw new Error('That draft file could not be read'); }
  if (!draft || typeof draft !== 'object' || !('type' in draft) || draft.type !== 'strata-page' || !('version' in draft) || draft.version !== 1 || !('format' in draft) || draft.format !== editorFormat || !('kind' in draft) || (draft.kind !== 'note' && draft.kind !== 'board')) throw new Error('Choose a Strata page draft from this editor version');
  if (!('state' in draft) || typeof draft.state !== 'string' || draft.state.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(draft.state)) throw new Error('That draft file could not be read');
  const document = new Y.Doc();
  try {
    try { Y.applyUpdate(document, Uint8Array.from(atob(draft.state), (character) => character.charCodeAt(0))); } catch { throw new Error('That draft file could not be read'); }
    return splitPageDraft(document, draft.kind).map((state, index, states) => {
      const title = 'title' in draft && typeof draft.title === 'string' ? draft.title.trim().slice(0, 200) : draft.kind === 'board' ? 'Recovered board' : 'Recovered page';
      const partTitle = states.length > 1 ? `${title.slice(0, 160)} (part ${index + 1}/${states.length})` : title;
      return {
        id: crypto.randomUUID(),
        title: partTitle,
        body: pageDraftBody(encodedPageState(state), draft.kind === 'board' ? 'board' : 'note', partTitle),
      };
    });
  } finally {
    document.destroy();
  }
}

export function recoverDraftPart(request: ReturnType<typeof useAuth>['request'], spaceId: string, part: DraftPart) {
  return request<{ id: string }>(`/spaces/${spaceId}/page-drafts`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Recovery-Id': part.id }, body: part.body });
}
