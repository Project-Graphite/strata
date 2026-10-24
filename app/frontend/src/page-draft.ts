import * as Y from 'yjs';
import { saveBlob } from './files';
import { encodedPageState, pageDraftBody } from './draft-format';

export function downloadPageDraft(document: Y.Doc, kind: 'note' | 'board', noteId: string) {
  saveBlob(pageDraftBody(encodedPageState(Y.encodeStateAsUpdate(document)), kind, kind === 'board' ? 'Recovered board' : 'Recovered page'), `${kind}-${noteId}.strata-page`);
}
