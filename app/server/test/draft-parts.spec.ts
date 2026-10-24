import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { draftRecoveryParts, splitPageDraft } from '../../frontend/src/draft-parts';
import { readPageDraft } from '../src/notes/page-draft';
import { editorFormat } from '../src/notes/editor-format';

function element(name: string, children: (Y.XmlElement | Y.XmlText)[] = []) {
  const node = new Y.XmlElement(name);
  node.insert(0, children);
  return node;
}

function text(node: Y.XmlFragment | Y.XmlElement | Y.XmlText): string {
  return node instanceof Y.XmlText ? node.toDelta().map((entry) => typeof entry.insert === 'string' ? entry.insert : '').join('') : node.toArray().map((child) => child instanceof Y.XmlElement || child instanceof Y.XmlText ? text(child) : '').join('');
}

function decoded(state: Uint8Array) {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return document;
}

describe('automatic split draft recovery', () => {
  it('splits a page past the server limit without changing the source or dropping text', async () => {
    const original = new Y.Doc();
    original.getXmlFragment('default').push([element('paragraph', [new Y.XmlText('Large draft '.repeat(550_000))])]);
    const before = Y.encodeStateAsUpdate(original);
    const parts = await draftRecoveryParts(new File([JSON.stringify({ type: 'strata-page', version: 1, format: editorFormat, kind: 'note', title: 'Large page', state: Buffer.from(before).toString('base64') })], 'large.strata-page'));
    expect(parts.length).toBeGreaterThan(1);
    let recoveredText = '';
    for (const part of parts) {
      expect(part.body.size).toBeLessThan(8 * 1024 * 1024);
      const recovered = readPageDraft(Buffer.from(await part.body.arrayBuffer()));
      recoveredText += text(recovered.document.getXmlFragment('default'));
      expect(recovered.title).toBe(part.title);
      recovered.document.destroy();
    }
    expect(recoveredText).toBe(text(original.getXmlFragment('default')));
    expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(original)), Buffer.from(before))).toBe(0);
    expect(new Set(parts.map((part) => part.id)).size).toBe(parts.length);
    original.destroy();
  });

  it('keeps graphemes, formatting and block attributes through long text splits', () => {
    const original = new Y.Doc();
    const marked = new Y.XmlText();
    const heading = element('heading', [marked]);
    heading.setAttribute('id', 'original-heading');
    heading.setAttribute('level', 2 as never);
    original.getXmlFragment('default').push([heading]);
    marked.applyDelta([{ insert: '🧑‍💻é'.repeat(800), attributes: { bold: {} } }]);
    const parts = splitPageDraft(original, 'note', 2_000).map(decoded);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((part) => text(part.getXmlFragment('default'))).join('')).toBe(text(original.getXmlFragment('default')));
    for (const part of parts) {
      const restored = part.getXmlFragment('default').get(0) as Y.XmlElement;
      expect(restored.getAttributes()).toEqual(heading.getAttributes());
      const content = restored.get(0) as Y.XmlText;
      expect(content.toDelta().every((entry) => entry.attributes?.bold)).toBe(true);
      expect(/^(?:🧑‍💻|é)+$/u.test(text(content))).toBe(true);
      expect(Y.encodeStateAsUpdate(part).byteLength).toBeLessThanOrEqual(2_000);
      part.destroy();
    }
    original.destroy();
  });

  it('keeps required toggle and nested-list structure while distributing text once', () => {
    for (const root of [
      element('details', [element('detailsSummary', [new Y.XmlText('Summary '.repeat(300))]), element('detailsContent', [element('paragraph', [new Y.XmlText('Content '.repeat(1_000))])])]),
      element('orderedList', [element('listItem', [element('paragraph', [new Y.XmlText('First paragraph '.repeat(200))]), element('bulletList', [element('listItem', [element('paragraph', [new Y.XmlText('Nested '.repeat(1_000))])])])])]),
    ]) {
      const original = new Y.Doc();
      original.getXmlFragment('default').push([root]);
      const parts = splitPageDraft(original, 'note', 1_500).map(decoded);
      expect(parts.map((part) => text(part.getXmlFragment('default'))).join('')).toBe(text(original.getXmlFragment('default')));
      const check = (node: Y.XmlFragment | Y.XmlElement) => {
        if (node instanceof Y.XmlElement && node.nodeName === 'details') expect(node.toArray().map((child) => (child as Y.XmlElement).nodeName)).toEqual(['detailsSummary', 'detailsContent']);
        if (node instanceof Y.XmlElement && node.nodeName === 'listItem') expect((node.get(0) as Y.XmlElement).nodeName).toBe('paragraph');
        for (const child of node.toArray()) if (child instanceof Y.XmlElement) check(child);
      };
      for (const part of parts) { check(part.getXmlFragment('default')); part.destroy(); }
      original.destroy();
    }
  });

  it('keeps bound board elements together and every element exactly once', () => {
    const original = new Y.Doc();
    const board = original.getMap<Record<string, unknown>>('board');
    for (let index = 0; index < 6; index += 1) {
      board.set(`shape-${index}`, { id: `shape-${index}`, type: 'rectangle', text: 'x'.repeat(1_000), boundElements: [{ id: `label-${index}` }] });
      board.set(`label-${index}`, { id: `label-${index}`, type: 'text', text: 'y'.repeat(1_000), containerId: `shape-${index}` });
    }
    const parts = splitPageDraft(original, 'board', 5_000).map(decoded);
    const restored = new Map<string, unknown>();
    for (const part of parts) {
      const elements = part.getMap<Record<string, unknown>>('board');
      for (const [id, entry] of elements) {
        expect(restored.has(id)).toBe(false);
        restored.set(id, entry);
        if (typeof entry.containerId === 'string') expect(elements.has(entry.containerId)).toBe(true);
        for (const bound of entry.boundElements as { id: string }[] ?? []) expect(elements.has(bound.id)).toBe(true);
      }
      expect(Y.encodeStateAsUpdate(part).byteLength).toBeLessThanOrEqual(5_000);
      part.destroy();
    }
    expect(Object.fromEntries(restored)).toEqual(board.toJSON());
    original.destroy();
  });

  it('refuses an indivisible oversized group without changing the original', () => {
    const original = new Y.Doc();
    original.getMap('board').set('shape', { id: 'shape', text: 'x'.repeat(10_000) });
    const before = Y.encodeStateAsUpdate(original);
    expect(() => splitPageDraft(original, 'board', 1_000)).toThrow('Keep the original draft file');
    expect(Y.encodeStateAsUpdate(original)).toEqual(before);
    original.destroy();
  });
});
