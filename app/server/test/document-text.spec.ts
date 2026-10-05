import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { documentText } from '../src/notes/document-text';

function block(name: string, ...children: (Y.XmlElement | Y.XmlText)[]) {
  const element = new Y.XmlElement(name);
  element.insert(0, children);
  return element;
}

describe('documentText', () => {
  it('turns a note into plain text with one line per block and no formatting', () => {
    const document = new Y.Doc();
    const bold = new Y.XmlText();
    bold.insert(0, 'Pack ');
    bold.insert(5, 'light', { bold: true });
    document.getXmlFragment('default').push([
      block('heading', new Y.XmlText('Trip')),
      block('paragraph', bold),
      block('bulletList', block('listItem', block('paragraph', new Y.XmlText('Passport'))), block('listItem', block('paragraph', new Y.XmlText('Charger')))),
    ]);

    expect(documentText(document)).toBe('Trip\nPack light\nPassport\nCharger');
    expect(documentText(document, 6)).toBe('Trip\nP');
    expect(documentText(new Y.Doc())).toBe('');
  });
});
