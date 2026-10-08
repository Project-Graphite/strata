import { Avatar, LinesSkeleton, useSnackbar } from '@project-graphite/ui';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import type { EditorView } from '@tiptap/pm/view';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { maxUploadBytes, preparedUpload } from '../files';
import type { Item } from '../spaces';
import { colorFor, useLiveDocument, useLiveStatus, type Connection } from './live-document';
import { internalPath, mentionExtension, StoredImageExtension } from './note-extensions';

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

function CollaborativeEditor({ connection, editable, noteId, spaceId }: { connection: Connection; editable: boolean; noteId: string; spaceId: string }) {
  const auth = useAuth();
  const show = useSnackbar();
  const navigate = useNavigate();
  const { label, people } = useLiveStatus(connection, editable);
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
        mentionExtension(auth.request, noteId),
        StoredImageExtension,
      ],
      editorProps: {
        attributes: { 'aria-label': 'Page content', class: 'note-content' },
        handleClickOn: (_view, _position, node) => {
          const path = internalPath(node.attrs.href);
          if (node.type.name !== 'mention' || !path) return false;
          navigate(path);
          return true;
        },
        handlePaste: (view, event) => insertImages(view, [...(event.clipboardData?.files ?? [])]),
        handleDrop: (view, event) => insertImages(view, [...((event as DragEvent).dataTransfer?.files ?? [])]),
      },
    },
    [connection],
  );

  function insertImages(view: EditorView, files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!editable || images.length === 0) return false;
    void (async () => {
      for (const file of images) {
        if (file.size > maxUploadBytes) {
          show({ message: `${file.name} is over 25 MB.`, tone: 'error' });
          continue;
        }
        try {
          const uploaded = await auth.request<Item>(`/spaces/${spaceId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
            body: await preparedUpload(file),
          });
          const image = view.state.schema.nodes.image!.create({ fileId: uploaded.id, alt: file.name });
          view.dispatch(view.state.tr.replaceSelectionWith(image));
        } catch {
          show({ message: `Could not upload ${file.name}.`, tone: 'error' });
        }
      }
    })();
    return true;
  }

  if (!editor) return <LinesSkeleton label="Loading the editor" lines={6} />;
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

export default function NoteEditor({ editable, noteId, spaceId }: { editable: boolean; noteId: string; spaceId: string }) {
  const connection = useLiveDocument(noteId);
  if (!connection) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return <CollaborativeEditor connection={connection} editable={editable} noteId={noteId} spaceId={spaceId} />;
}
