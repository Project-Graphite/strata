import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { boardElementsKey, documentLinks, documentText } from '../src/notes/document-text';

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

  it('reads the text boxes and images of a board, leaving out deleted elements', () => {
    const document = new Y.Doc();
    const board = document.getMap(boardElementsKey);
    board.set('a', { id: 'a', type: 'text', text: 'Seating plan' });
    board.set('b', { id: 'b', type: 'rectangle' });
    board.set('c', { id: 'c', type: 'text', text: 'Old idea', isDeleted: true });
    board.set('d', { id: 'd', type: 'image', fileId: 'photo-file' });
    board.set('e', { id: 'e', type: 'image', fileId: 'removed-file', isDeleted: true });

    expect(documentText(document)).toBe('Seating plan');
    expect([...documentLinks(document).files]).toEqual(['photo-file']);
  });
});
