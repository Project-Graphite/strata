import { useMemo } from 'react';
import Collaboration from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import * as Y from 'yjs';
import { FileSourceContext, sharedFiles } from './file-source';
import { pageContent } from './note-extensions';

const unavailable = () => Promise.reject(new Error('Signed-in features are not available on shared pages'));

export default function SharedDocument({ code, state }: { code: string; state: string | null }) {
  const document = useMemo(() => {
    const shared = new Y.Doc();
    if (state) Y.applyUpdate(shared, Uint8Array.from(atob(state), (character) => character.charCodeAt(0)));
    return shared;
  }, [state]);
  const files = useMemo(() => sharedFiles(code), [code]);
  const editor = useEditor(
    {
      editable: false,
      extensions: [...pageContent(unavailable, ''), Collaboration.configure({ document })],
      editorProps: { attributes: { 'aria-label': 'Shared page', class: 'note-content' } },
    },
    [document],
  );

  return (
    <FileSourceContext.Provider value={files}>
      <EditorContent editor={editor} />
    </FileSourceContext.Provider>
  );
}
