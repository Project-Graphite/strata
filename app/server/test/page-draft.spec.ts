import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { readBody } from '../src/http/read-body';
import { maxDocumentBytes, maxDraftFileBytes } from '../src/notes/document-limits';
import { readPageDraft } from '../src/notes/page-draft';
import { editorFormat } from '../src/notes/editor-format';

function file(state: Uint8Array, overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({ type: 'strata-page', version: 1, format: editorFormat, kind: 'note', title: 'Recovered title', state: Buffer.from(state).toString('base64'), ...overrides }));
}

describe('page draft recovery', () => {
  it('preserves rich blocks, marks, IDs and board values', () => {
    const original = new Y.Doc();
    const heading = new Y.XmlElement('heading');
    heading.setAttribute('id', 'linked-heading');
    heading.setAttribute('level', 2 as never);
    const text = new Y.XmlText();
    heading.insert(0, [text]);
    original.getXmlFragment('default').push([heading]);
    text.applyDelta([{ insert: 'Formatted text', attributes: { bold: {} } }]);
    original.getMap('board').set('box', { id: 'box', type: 'rectangle', x: 12, y: 34 });
    const recovered = readPageDraft(file(Y.encodeStateAsUpdate(original), { kind: 'board' }));
    try {
      expect(recovered.document.getXmlFragment('default').toString()).toBe(original.getXmlFragment('default').toString());
      expect(recovered.document.getMap('board').toJSON()).toEqual(original.getMap('board').toJSON());
      expect(recovered).toMatchObject({ board: true, title: 'Recovered title' });
    } finally {
      original.destroy();
      recovered.document.destroy();
    }
  });

  it('rejects incompatible formats, invalid data and oversized files or document states', () => {
    const document = new Y.Doc();
    const state = Y.encodeStateAsUpdate(document);
    document.destroy();
    for (const overrides of [{ format: editorFormat + 1 }, { type: 'other' }, { version: 2 }, { kind: 'database' }, { state: 'not base64!' }, { state: '' }, { state: Buffer.from('invalid Yjs').toString('base64') }]) {
      expect(() => readPageDraft(file(state, overrides))).toThrow();
    }
    for (const data of ['null', '[]', '"text"', '{']) expect(() => readPageDraft(Buffer.from(data))).toThrow();
    expect(() => readPageDraft(Buffer.alloc(maxDraftFileBytes + 1))).toThrow('at most 8 MB');
    expect(() => readPageDraft(file(Buffer.alloc(maxDocumentBytes + 1)))).toThrow('at most 5 MB');
  });
});

describe('bounded raw uploads', () => {
  it('checks the stream even when a content length is absent or incorrect', async () => {
    for (const headers of [{}, { 'content-length': '1' }]) {
      const request = Object.assign(Readable.from([Buffer.from('abcd'), Buffer.from('efgh')]), { headers });
      await expect(readBody(request as never, 6, 'Upload limit')).rejects.toThrow('Upload limit');
    }
    await expect(readBody(Object.assign(Readable.from([]), { headers: {} }) as never, 6, 'Upload limit')).rejects.toThrow('file is empty');
    await expect(readBody(Object.assign(Readable.from([Buffer.from('draft')]), { headers: {} }) as never, 6, 'Upload limit')).resolves.toEqual(Buffer.from('draft'));
  });
});
