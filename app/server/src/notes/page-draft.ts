import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as Y from 'yjs';
import { editorFormat } from './editor-format';
import { maxDocumentBytes, maxDraftFileBytes } from './document-limits';

export function readPageDraft(bytes: Buffer) {
  if (bytes.byteLength > maxDraftFileBytes) throw new PayloadTooLargeException('Draft files can be at most 8 MB');
  let draft: unknown;
  try {
    draft = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new BadRequestException('That draft file could not be read');
  }
  if (!draft || typeof draft !== 'object' || !('type' in draft) || draft.type !== 'strata-page' || !('version' in draft) || draft.version !== 1 || !('format' in draft) || draft.format !== editorFormat) {
    throw new BadRequestException('Choose a Strata page draft from this editor version');
  }
  if (!('kind' in draft) || (draft.kind !== 'note' && draft.kind !== 'board') || !('state' in draft) || typeof draft.state !== 'string' || draft.state.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(draft.state)) {
    throw new BadRequestException('That draft file could not be read');
  }
  const state = Buffer.from(draft.state, 'base64');
  if (state.byteLength > maxDocumentBytes) throw new PayloadTooLargeException('The recovered page can be at most 5 MB');
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, state);
    if (Y.encodeStateAsUpdate(document).byteLength > maxDocumentBytes) throw new PayloadTooLargeException('The recovered page can be at most 5 MB');
  } catch (error) {
    document.destroy();
    if (error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException('That draft file could not be read');
  }
  return { document, state: draft.state, board: draft.kind === 'board', title: 'title' in draft && typeof draft.title === 'string' ? draft.title.trim().slice(0, 200) : draft.kind === 'board' ? 'Recovered board' : 'Recovered page' };
}
