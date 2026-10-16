import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Icon, LinesSkeleton, Menu, TextField, useSnackbar, type MenuItem } from '@project-graphite/ui';
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
import { maxUploadBytes, uploadFile } from '../files';
import { FormDialog } from './FormDialog';
import { colorFor, useLiveDocument, useLiveStatus, type Connection } from './live-document';
import type { QuotedBlock } from './NoteComments';
import { blockChoices, blockMenuExtension, CommentedBlocks, commentedBlocksKey, internalPath, pageContent, type BlockActions } from './note-extensions';

const turnInto = new Set(['text', 'heading', 'subheading', 'bullets', 'numbers', 'checklist', 'quote', 'code', 'callout', 'toggle']);

interface Block {
  node: BlockNode;
  pos: number;
}

function blockItems(editor: Editor, actions: BlockActions, block: Block | undefined, onComment?: (block: QuotedBlock) => void): MenuItem[] {
  if (!block) return [];
  const at = (pos: number, bias: 1 | -1 = 1) =>
    editor.chain().focus().command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos), bias));
      return true;
    });
  const end = block.pos + block.node.nodeSize;
  const cell = () => (editor.state.selection.from > block.pos && editor.state.selection.from < end ? editor.chain().focus() : at(end - 2, -1));
  return [
    { label: 'Duplicate', onSelect: () => editor.chain().focus().insertContentAt(end, block.node.toJSON()).run() },
    { label: 'Delete', onSelect: () => editor.chain().focus().deleteRange({ from: block.pos, to: end }).run() },
    ...(onComment && typeof block.node.attrs.id === 'string'
      ? [{ label: 'Comment', onSelect: () => onComment({ id: block.node.attrs.id as string, excerpt: block.node.textContent.trim().slice(0, 80) }) }]
      : []),
    ...(block.node.type.name === 'table'
      ? [
          { label: 'Add a row', onSelect: () => at(end - 2, -1).addRowAfter().run(), separated: true },
          { label: 'Add a column', onSelect: () => at(end - 2, -1).addColumnAfter().run() },
          { label: 'Delete row', onSelect: () => cell().deleteRow().run() },
          { label: 'Delete column', onSelect: () => cell().deleteColumn().run() },
        ]
      : blockChoices(actions)
          .filter((choice) => turnInto.has(choice.id))
          .map((choice, index) => ({ label: `Turn into ${choice.label.toLowerCase()}`, onSelect: () => choice.run(at(block.pos + 1).clearNodes(), editor), separated: index === 0 }))),
  ];
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  return (
    <FormDialog
      busy={false}
      busyLabel=""
      onClose={onClose}
      onSubmit={(form) => {
        const typed = String(new FormData(form).get('href')).trim();
        const href = !typed || /^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : `https://${typed}`;
        const chain = editor.chain().focus().extendMarkRange('link');
        if (!href) chain.unsetLink().run();
        else if (editor.state.selection.empty && !editor.isActive('link')) chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
        else chain.setLink({ href }).run();
        onClose();
      }}
      submitLabel="Save link"
      title="Link"
    >
      <TextField defaultValue={editor.getAttributes('link').href ?? ''} inputMode="url" label="Address" name="href" placeholder="https://" />
    </FormDialog>
  );
}

function SelectionBlockMenu({ actions, editor, onComment }: { actions: BlockActions; editor: Editor; onComment?: (block: QuotedBlock) => void }) {
  const block = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { $from } = current.state.selection;
      const pos = $from.depth ? $from.before(1) : $from.pos;
      const node = current.state.doc.nodeAt(pos);
      return node ? { node, pos } : undefined;
    },
    equalityFn: (a, b) => a?.node === b?.node && a?.pos === b?.pos,
  });
  return <Menu items={blockItems(editor, actions, block, onComment)} label="Block actions" trigger="Block" triggerClassName="note-tool" triggerLabel="Change this block" />;
}

function Toolbar({ actions, editor, onComment }: { actions: BlockActions; editor: Editor; onComment?: (block: QuotedBlock) => void }) {
  const [linking, setLinking] = useState(false);
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
      link: current.isActive('link'),
    }),
  });
  const tools: [ReactNode, string, boolean, () => void][] = [
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
    [<Icon name="link" size={16} />, 'Link', state.link, () => setLinking(true)],
  ];
  return (
    <div aria-label="Formatting" className="note-toolbar" role="toolbar">
      <button aria-label="Undo" className="note-tool" onClick={() => editor.chain().focus().undo().run()} title="Undo" type="button">
        ↶
      </button>
      <button aria-label="Redo" className="note-tool" onClick={() => editor.chain().focus().redo().run()} title="Redo" type="button">
        ↷
      </button>
      {tools.map(([symbol, label, active, run]) => (
        <button aria-label={label} aria-pressed={active} className="note-tool" key={label} onClick={run} title={label} type="button">
          {symbol}
        </button>
      ))}
      {window.matchMedia('(hover: none)').matches && <SelectionBlockMenu actions={actions} editor={editor} onComment={onComment} />}
      {linking && <LinkDialog editor={editor} onClose={() => setLinking(false)} />}
    </div>
  );
}

interface CommentHooks {
  onComment?: (block: QuotedBlock) => void;
  commentedBlocks?: string[];
}

function CollaborativeEditor({
  connection,
  editable,
  noteId,
  spaceId,
  onComment,
  commentedBlocks,
}: { connection: Connection; editable: boolean; noteId: string; spaceId: string } & CommentHooks) {
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
        CommentedBlocks,
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
          const uploaded = await uploadFile(auth.request, spaceId, file);
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

  const commented = (commentedBlocks ?? []).join(' ');
  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(commentedBlocksKey, new Set(commented ? commented.split(' ') : [])).setMeta('addToHistory', false));
  }, [editor, commented]);

  if (!editor) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return (
    <div className="note-editor grid gap-3">
      <div className={`flex flex-wrap items-center justify-between gap-3 ${editable && !outdated ? 'sticky top-(--header-height) z-10 bg-paper py-2' : ''}`}>
        {editable && !outdated ? <Toolbar actions={actions} editor={editor} onComment={onComment} /> : <span />}
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
      {editable && !outdated && <BlockHandle actions={actions} editor={editor} onComment={onComment} />}
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

function BlockHandle({ actions, editor, onComment }: { actions: BlockActions; editor: Editor; onComment?: (block: QuotedBlock) => void }) {
  const [block, setBlock] = useState<Block>();
  return (
    <DragHandle editor={editor} onNodeChange={({ node, pos }) => setBlock(node ? { node, pos } : undefined)}>
      <Menu
        header={<HoldHandle editor={editor} />}
        items={blockItems(editor, actions, block, onComment)}
        label="Block actions"
        trigger="⠿"
        triggerClassName="note-block-handle"
        triggerLabel="Move or change this block"
      />
    </DragHandle>
  );
}

export default function NoteEditor({ editable, noteId, spaceId, ...hooks }: { editable: boolean; noteId: string; spaceId: string } & CommentHooks) {
  const connection = useLiveDocument(noteId);
  if (!connection) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return <CollaborativeEditor connection={connection} editable={editable} noteId={noteId} spaceId={spaceId} {...hooks} />;
}
