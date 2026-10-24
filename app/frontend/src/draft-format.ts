import { editorFormat } from './editor-format';

export const maxPageStateBytes = 5 * 1024 * 1024;

export function encodedPageState(state: Uint8Array) {
  let binary = '';
  for (let start = 0; start < state.length; start += 0x8000) binary += String.fromCharCode(...state.subarray(start, start + 0x8000));
  return btoa(binary);
}

export function pageDraftBody(state: string, kind: 'note' | 'board', title: string) {
  return new Blob([JSON.stringify({ type: 'strata-page', version: 1, format: editorFormat, kind, title, state })], { type: 'application/octet-stream' });
}
