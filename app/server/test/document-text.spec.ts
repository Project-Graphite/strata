import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { boardElementsKey, documentLinks, documentText, updateLinks } from '../src/notes/document-text';

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

  it('links the boards embedded in a page', () => {
    const document = new Y.Doc();
    const embed = new Y.XmlElement('boardEmbed');
    embed.setAttribute('boardId', 'seating-board');
    document.getXmlFragment('default').push([embed]);

    expect([...documentLinks(document).mentions]).toEqual(['seating-board']);
  });

  it('links attached files and page links, and leaves people mentions out', () => {
    const document = new Y.Doc();
    const attachment = new Y.XmlElement('fileAttachment');
    attachment.setAttribute('fileId', 'minutes-pdf');
    const pageLink = new Y.XmlElement('mention');
    pageLink.setAttribute('id', 'budget-page');
    pageLink.setAttribute('mentionSuggestionChar', '[[');
    const person = new Y.XmlElement('personMention');
    person.setAttribute('id', 'user-1');
    document.getXmlFragment('default').push([attachment, block('paragraph', pageLink, person)]);

    expect(documentLinks(document)).toEqual({ mentions: new Set(['budget-page']), files: new Set(['minutes-pdf']) });
  });
});

describe('updateLinks', () => {
  function edit(server: Y.Doc, change: (client: Y.Doc) => void) {
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    const before = Y.encodeStateVector(client);
    change(client);
    const update = Y.encodeStateAsUpdate(client, before);
    client.destroy();
    return update;
  }

  it('reads only the references an update adds, without walking typed text or block ids', () => {
    const server = new Y.Doc();
    const update = edit(server, (client) => {
      const mention = new Y.XmlElement('mention');
      mention.setAttribute('id', 'task-1');
      const paragraph = block('paragraph', new Y.XmlText('Hello '), mention);
      paragraph.setAttribute('id', 'block-1');
      client.getXmlFragment('default').push([paragraph]);
      client.getMap(boardElementsKey).set('photo', { id: 'photo', type: 'image', fileId: 'file-1' });
    });

    expect(updateLinks(server, update)).toEqual({ mentions: new Set(['task-1']), files: new Set(['file-1']) });
    Y.applyUpdate(server, update);
    const typing = edit(server, (client) => ((client.getXmlFragment('default').get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(6, 'there '));
    expect(updateLinks(server, typing)).toEqual({ mentions: new Set(), files: new Set() });
  });

  it('resolves changed attributes of existing nodes through the stored document', () => {
    const server = new Y.Doc();
    const image = new Y.XmlElement('image');
    image.setAttribute('fileId', 'shared-file');
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.setAttribute('id', 'old-block');
    server.getXmlFragment('default').push([image, paragraph]);

    const swapped = edit(server, (client) => {
      (client.getXmlFragment('default').get(0) as Y.XmlElement).setAttribute('fileId', 'private-file');
      (client.getXmlFragment('default').get(1) as Y.XmlElement).setAttribute('id', 'new-block');
    });
    expect(updateLinks(server, swapped)).toEqual({ mentions: new Set(), files: new Set(['private-file']) });
  });

  it('reads the files that attachment blocks add, but not people mentions', () => {
    const server = new Y.Doc();
    const update = edit(server, (client) => {
      const attachment = new Y.XmlElement('fileAttachment');
      attachment.setAttribute('fileId', 'private-file');
      attachment.setAttribute('name', 'notes.pdf');
      const person = new Y.XmlElement('personMention');
      person.setAttribute('id', 'user-1');
      client.getXmlFragment('default').push([attachment, block('paragraph', person)]);
    });

    expect(updateLinks(server, update)).toEqual({ mentions: new Set(), files: new Set(['private-file']) });
  });
});
