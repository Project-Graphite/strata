import { useEffect, useState } from 'react';
import { Avatar, LinesSkeleton, Menu, useSnackbar, type MenuItem } from '@project-graphite/ui';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Node as BlockNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { maxUploadBytes, preparedUpload } from '../files';
import type { Item } from '../spaces';
import { colorFor, useLiveDocument, useLiveStatus, type Connection } from './live-document';
import { blockChoices, blockMenuExtension, internalPath, pageContent, type BlockActions } from './note-extensions';

const turnInto = new Set(['text', 'heading', 'subheading', 'bullets', 'numbers', 'checklist', 'quote', 'code', 'callout', 'toggle']);

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      highlight: current.isActive('highlight'),
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
    ['▮', 'Highlight', state.highlight, () => editor.chain().focus().toggleHighlight().run()],
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
  const { label, people, outdated } = useLiveStatus(connection, editable);
  const user = auth.user!;

  const actions: BlockActions = { onImages: insertImages, onBoard: addBoard };

  const editor = useEditor(
    {
      editable,
      extensions: [
        ...pageContent(auth.request, noteId),
        Placeholder.configure({ placeholder: editable ? 'Start writing…' : '' }),
        Collaboration.configure({ document: connection.document }),
        CollaborationCaret.configure({ provider: connection.provider, user: { name: user.displayName, color: colorFor(user.id) } }),
        blockMenuExtension(actions),
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

  function addBoard(target: Editor) {
    auth
      .request<{ id: string }>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify({ board: true, parentId: noteId, title: 'Board' }) })
      .then(
        (board) => target.chain().focus().insertContent({ type: 'boardEmbed', attrs: { boardId: board.id } }).run(),
        () => show({ message: 'Could not add a board.', tone: 'error' }),
      );
  }

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

  useEffect(() => {
    if (outdated) editor?.setEditable(false);
  }, [editor, outdated]);

  if (!editor) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return (
    <div className="note-editor grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editable && !outdated ? <Toolbar editor={editor} /> : <span />}
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
      {editable && !outdated && <BlockHandle actions={actions} editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function HoldHandle({ editor }: { editor: Editor }) {
  useEffect(() => {
    editor.commands.setMeta('lockDragHandle', true);
    return () => {
      editor.commands.setMeta('lockDragHandle', false);
    };
  }, [editor]);
  return null;
}

function BlockHandle({ actions, editor }: { actions: BlockActions; editor: Editor }) {
  const [block, setBlock] = useState<{ node: BlockNode; pos: number }>();
  const at = (pos: number, bias: 1 | -1 = 1) =>
    editor.chain().focus().command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos), bias));
      return true;
    });
  const items: MenuItem[] = block
    ? [
        { label: 'Duplicate', onSelect: () => editor.chain().focus().insertContentAt(block.pos + block.node.nodeSize, block.node.toJSON()).run() },
        { label: 'Delete', onSelect: () => editor.chain().focus().deleteRange({ from: block.pos, to: block.pos + block.node.nodeSize }).run() },
        ...(block.node.type.name === 'table'
          ? [
              { label: 'Add a row', onSelect: () => at(block.pos + block.node.nodeSize - 2, -1).addRowAfter().run(), separated: true },
              { label: 'Add a column', onSelect: () => at(block.pos + block.node.nodeSize - 2, -1).addColumnAfter().run() },
            ]
          : blockChoices(actions)
              .filter((choice) => turnInto.has(choice.id))
              .map((choice, index) => ({ label: `Turn into ${choice.label.toLowerCase()}`, onSelect: () => choice.run(at(block.pos + 1).clearNodes(), editor), separated: index === 0 }))),
      ]
    : [];
  return (
    <DragHandle editor={editor} onNodeChange={({ node, pos }) => setBlock(node ? { node, pos } : undefined)}>
      <Menu
        header={<HoldHandle editor={editor} />}
        items={items}
        label="Block actions"
        trigger="⠿"
        triggerClassName="note-block-handle"
        triggerLabel="Move or change this block"
      />
    </DragHandle>
  );
}

export default function NoteEditor({ editable, noteId, spaceId }: { editable: boolean; noteId: string; spaceId: string }) {
  const connection = useLiveDocument(noteId);
  if (!connection) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return <CollaborativeEditor connection={connection} editable={editable} noteId={noteId} spaceId={spaceId} />;
}
