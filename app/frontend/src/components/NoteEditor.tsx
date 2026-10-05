import { useEffect, useRef, useState } from 'react';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { Avatar, LinesSkeleton, useSnackbar } from '@project-graphite/ui';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import * as Y from 'yjs';
import { useAuth } from '../auth';
import { realtimeUrl } from '../notes';

interface Connection {
  document: Y.Doc;
  provider: HocuspocusProvider;
}

interface Person {
  clientId: number;
  name: string;
  color: string;
}

const colors = ['#e5736b', '#e0915a', '#d7b24a', '#5fbf7f', '#4fb3c4', '#6b8fe5', '#a07be5', '#e57bb5'];

function colorFor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length]!;
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      heading1: current.isActive('heading', { level: 1 }),
      heading2: current.isActive('heading', { level: 2 }),
      bullets: current.isActive('bulletList'),
      numbers: current.isActive('orderedList'),
      checklist: current.isActive('taskList'),
      quote: current.isActive('blockquote'),
      code: current.isActive('codeBlock'),
    }),
  });
  const tools: [string, string, boolean, () => void][] = [
    ['B', 'Bold', state.bold, () => editor.chain().focus().toggleBold().run()],
    ['I', 'Italic', state.italic, () => editor.chain().focus().toggleItalic().run()],
    ['H1', 'Heading', state.heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run()],
    ['H2', 'Subheading', state.heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    ['•', 'Bulleted list', state.bullets, () => editor.chain().focus().toggleBulletList().run()],
    ['1.', 'Numbered list', state.numbers, () => editor.chain().focus().toggleOrderedList().run()],
    ['☐', 'Checklist', state.checklist, () => editor.chain().focus().toggleTaskList().run()],
    ['“', 'Quote', state.quote, () => editor.chain().focus().toggleBlockquote().run()],
    ['</>', 'Code block', state.code, () => editor.chain().focus().toggleCodeBlock().run()],
  ];
  return (
    <div aria-label="Formatting" className="note-toolbar" role="toolbar">
      {tools.map(([symbol, label, active, run]) => (
        <button aria-label={label} aria-pressed={active} className="note-tool" key={label} onClick={run} title={label} type="button">
          {symbol}
        </button>
      ))}
    </div>
  );
}

function CollaborativeEditor({ connection, editable }: { connection: Connection; editable: boolean }) {
  const auth = useAuth();
  const show = useSnackbar();
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [unsynced, setUnsynced] = useState(0);
  const user = auth.user!;

  const editor = useEditor(
    {
      editable,
      extensions: [
        StarterKit.configure({ undoRedo: false, link: { openOnClick: true, autolink: true, protocols: ['https', 'http', 'mailto'] } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: editable ? 'Start writing…' : '' }),
        Collaboration.configure({ document: connection.document }),
        CollaborationCaret.configure({ provider: connection.provider, user: { name: user.displayName, color: colorFor(user.id) } }),
      ],
      editorProps: { attributes: { 'aria-label': 'Page content', class: 'note-content' } },
    },
    [connection],
  );

  useEffect(() => {
    const { provider } = connection;
    const onStatus = ({ status: next }: { status: 'connecting' | 'connected' | 'disconnected' }) => setStatus(next);
    const onUnsynced = ({ number }: { number: number }) => setUnsynced(number);
    const onAwareness = () =>
      setPeople(
        [...(provider.awareness?.getStates().entries() ?? [])]
          .filter(([clientId, state]) => clientId !== provider.awareness?.clientID && state.user)
          .map(([clientId, state]) => ({ clientId, ...(state.user as { name: string; color: string }) })),
      );
    const onStateless = ({ payload }: { payload: string }) => {
      if (payload.includes('too-large')) show({ message: 'This page is too large to save. Split it into smaller pages.', tone: 'error' });
    };
    provider.on('status', onStatus);
    provider.on('unsyncedChanges', onUnsynced);
    provider.on('awarenessChange', onAwareness);
    provider.on('stateless', onStateless);
    return () => {
      provider.off('status', onStatus);
      provider.off('unsyncedChanges', onUnsynced);
      provider.off('awarenessChange', onAwareness);
      provider.off('stateless', onStateless);
    };
  }, [connection, show]);

  if (!editor) return <LinesSkeleton label="Loading the editor" lines={6} />;
  const label =
    status === 'disconnected' ? 'Offline. Reconnecting…' : status === 'connecting' ? 'Connecting…' : unsynced > 0 ? 'Saving…' : editable ? 'Saved' : 'View only';

  return (
    <div className="note-editor grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editable ? <Toolbar editor={editor} /> : <span />}
        <div className="flex items-center gap-3">
          {people.length > 0 && (
            <div aria-label={`Also here: ${people.map((person) => person.name).join(', ')}`} className="flex -space-x-2" role="group">
              {people.slice(0, 5).map((person) => (
                <Avatar key={person.clientId} name={person.name} present />
              ))}
            </div>
          )}
          <span className="mono-sm text-faint" role="status">
            {label}
          </span>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export default function NoteEditor({ editable, noteId }: { editable: boolean; noteId: string }) {
  const auth = useAuth();
  const [connection, setConnection] = useState<Connection>();
  const accessToken = useRef(auth.accessToken);
  accessToken.current = auth.accessToken;

  useEffect(() => {
    const document = new Y.Doc();
    const websocketProvider = new HocuspocusProviderWebsocket({ url: realtimeUrl() });
    const provider = new HocuspocusProvider({ name: noteId, document, websocketProvider, token: () => accessToken.current() });
    provider.attach();
    setConnection({ document, provider });
    return () => {
      provider.destroy();
      websocketProvider.destroy();
      document.destroy();
    };
  }, [noteId]);

  if (!connection) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return <CollaborativeEditor connection={connection} editable={editable} />;
}
