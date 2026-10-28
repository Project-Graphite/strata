import ToggleButton from '@mui/material/ToggleButton';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Dialog, Icon, IconButton, LinesSkeleton, Menu, TextField, useSnackbar, type IconName, type MenuItem } from '@project-graphite/ui';
import { Extension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { Node as BlockNode, Slice } from '@tiptap/pm/model';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import type { Mapping } from '@tiptap/pm/transform';
import type { EditorView } from '@tiptap/pm/view';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { maxUploadBytes, saveBlob, uploadFile } from '../files';
import { FormDialog } from './FormDialog';
import { LiveDocumentStatus } from './LiveDocumentStatus';
import { PageBlockTarget } from './PageBlockTarget';
import { Copyable } from './Copyable';
import { downloadPageDraft } from '../page-draft';
import { colorFor, useLiveDocument, useLiveStatus, type Connection } from './live-document';
import type { QuotedBlock } from './NoteComments';
import { blockChoices, blockMenuExtension, CommentedBlocks, commentedBlocksKey, internalPath, pageContent, type BlockActions } from './note-extensions';
import { usePageFollowing } from './page-following';

const turnInto = new Set(['text', 'heading', 'subheading', 'bullets', 'numbers', 'checklist', 'quote', 'code', 'callout', 'toggle']);
const quickTools = new Set(['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Checklist', 'Link']);
const maxInsertBytes = 768 * 1024;

interface Block {
  node: BlockNode;
  pos: number;
}

function selectedBlock(editor: Editor): Block | undefined {
  const { $from } = editor.state.selection;
  const pos = $from.depth ? $from.before(1) : $from.pos;
  const node = editor.state.doc.nodeAt(pos);
  return node ? { node, pos } : undefined;
}

function moveBlock(editor: Editor, block: Block, direction: -1 | 1) {
  const siblings = editor.state.doc.resolve(block.pos);
  const sibling = siblings.parent.maybeChild(siblings.index() + direction);
  if (!sibling) return false;
  const end = block.pos + block.node.nodeSize;
  const position = direction < 0 ? block.pos - sibling.nodeSize : block.pos + sibling.nodeSize;
  const { from } = editor.state.selection;
  const offset = from > block.pos && from < end ? from - block.pos : 1;
  return editor.chain().focus().command(({ tr }) => {
    tr.delete(block.pos, end).insert(position, block.node);
    tr.setSelection(TextSelection.near(tr.doc.resolve(position + offset)));
    return true;
  }).scrollIntoView().run();
}

const BlockMoves = Extension.create({
  name: 'blockMoves',
  addKeyboardShortcuts() {
    const move = (direction: -1 | 1) => () => {
      const block = selectedBlock(this.editor);
      return block ? moveBlock(this.editor, block, direction) : false;
    };
    return { 'Mod-Shift-ArrowUp': move(-1), 'Mod-Shift-ArrowDown': move(1) };
  },
});

function relocate(doc: BlockNode, block: Block, mapping: Mapping): Block | undefined {
  let same: Block | undefined;
  doc.forEach((node, pos) => {
    if (node === block.node) same = { node, pos };
  });
  if (same) return same;
  const mapped = mapping.mapResult(block.pos);
  const node = mapped.deleted || doc.resolve(mapped.pos).depth ? null : doc.nodeAt(mapped.pos);
  return node ? { node, pos: mapped.pos } : undefined;
}

function blockItems(editor: Editor, actions: BlockActions, block: Block | undefined, onComment?: (block: QuotedBlock) => void): MenuItem[] {
  if (!block) return [];
  const at = (pos: number, bias: 1 | -1 = 1) =>
    editor.chain().focus().command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos), bias));
      return true;
    });
  const end = block.pos + block.node.nodeSize;
  const siblings = editor.state.doc.resolve(block.pos);
  const previous = siblings.parent.maybeChild(siblings.index() - 1);
  const next = siblings.parent.maybeChild(siblings.index() + 1);
  const cell = () => (editor.state.selection.from > block.pos && editor.state.selection.from < end ? editor.chain().focus() : at(end - 2, -1));
  return [
    ...(typeof block.node.attrs.id === 'string' && actions.onCopyBlock ? [{ label: 'Copy link to block', onSelect: () => actions.onCopyBlock!(block.node.attrs.id as string) }] : []),
    ...(previous ? [{ label: 'Move block up', onSelect: () => moveBlock(editor, block, -1) }] : []),
    ...(next ? [{ label: 'Move block down', onSelect: () => moveBlock(editor, block, 1) }] : []),
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
      submitLabel={editor.isActive('link') ? 'Save' : 'Add link'}
      title={editor.isActive('link') ? 'Edit link' : 'New link'}
    >
      <TextField defaultValue={editor.getAttributes('link').href ?? ''} inputMode="url" label="Address" name="href" placeholder="https://" />
    </FormDialog>
  );
}

function SelectionBlockMenu({ actions, editor, onComment }: { actions: BlockActions; editor: Editor; onComment?: (block: QuotedBlock) => void }) {
  const block = useEditorState({
    editor,
    selector: ({ editor: current }) => selectedBlock(current),
    equalityFn: (a, b) => a?.node === b?.node && a?.pos === b?.pos,
  });
  return <Menu items={blockItems(editor, actions, block, onComment)} label="Block actions" trigger="Block" triggerLabel="Change this block" triggerVariant="text" />;
}

const Toolbar = memo(function Toolbar({ actions, editor, onComment, quick }: { actions: BlockActions; editor: Editor; onComment?: (block: QuotedBlock) => void; quick: boolean }) {
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
  const tools: [IconName, string, boolean, () => void][] = [
    ['bold', 'Bold', state.bold, () => editor.chain().focus().toggleBold().run()],
    ['italic', 'Italic', state.italic, () => editor.chain().focus().toggleItalic().run()],
    ['highlight', 'Highlight', state.highlight, () => editor.chain().focus().toggleHighlight().run()],
    ['heading-1', 'Heading', state.heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run()],
    ['heading-2', 'Subheading', state.heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    ['list', 'Bulleted list', state.bullets, () => editor.chain().focus().toggleBulletList().run()],
    ['list-ordered', 'Numbered list', state.numbers, () => editor.chain().focus().toggleOrderedList().run()],
    ['checklist', 'Checklist', state.checklist, () => editor.chain().focus().toggleTaskList().run()],
    ['quote', 'Quote', state.quote, () => editor.chain().focus().toggleBlockquote().run()],
    ['code', 'Code block', state.code, () => editor.chain().focus().toggleCodeBlock().run()],
    ['link', 'Link', state.link, () => setLinking(true)],
  ];
  return (
    <div aria-label="Formatting" className="note-toolbar" role="toolbar">
      <IconButton icon="undo" label="Undo" onClick={() => editor.chain().focus().undo().run()} size="small" />
      <IconButton icon="redo" label="Redo" onClick={() => editor.chain().focus().redo().run()} size="small" />
      {(quick ? tools.filter(([, label]) => quickTools.has(label)) : tools).map(([icon, label, active, run]) => (
        <ToggleButton aria-label={label} className="border-0" key={label} onChange={run} selected={active} size="small" title={label} value={label}>
          <Icon name={icon} size={16} />
        </ToggleButton>
      ))}
      <SelectionBlockMenu actions={actions} editor={editor} onComment={onComment} />
      {linking && <LinkDialog editor={editor} onClose={() => setLinking(false)} />}
    </div>
  );
});

interface CommentHooks {
  onComment?: (block: QuotedBlock) => void;
  commentedBlocks?: string[];
}

function LiveStatus({ connection, editable, editor, noteId, onBlocked }: { connection: Connection; editable: boolean; editor: Editor; noteId: string; onBlocked: (blocked: boolean) => void }) {
  const status = useLiveStatus(connection, editable);
  const following = usePageFollowing(editor, connection, !status.blocked && status.people.length > 0);
  useLayoutEffect(() => onBlocked(status.blocked), [onBlocked, status.blocked]);
  return <LiveDocumentStatus onDownload={() => saveBlob(new Blob([editor.getText({ blockSeparator: '\n\n' })], { type: 'text/plain;charset=utf-8' }), `page-${noteId}-draft.txt`)} onDownloadDraft={() => downloadPageDraft(connection.document, 'note', noteId)} presenceActions={following} status={status} />;
}

export function CollaborativeEditor({
  connection,
  editable,
  noteId,
  quick,
  spaceId,
  onComment,
  commentedBlocks,
}: { connection: Connection; editable: boolean; noteId: string; quick: boolean; spaceId?: string } & CommentHooks) {
  const auth = useAuth();
  const show = useSnackbar();
  const navigate = useNavigate();
  const [blockLink, setBlockLink] = useState<string>();
  const [blocked, setBlocked] = useState(true);
  const user = connection.guest ? { id: `guest-${connection.document.clientID}`, displayName: 'Guest' } : auth.user!;
  const handlers = useRef({ addBoard, copyBlock, insert, insertImages });
  handlers.current = { addBoard, copyBlock, insert, insertImages };
  const { guest } = connection;

  const actions = useMemo<BlockActions>(() => ({
    onImages: guest || !spaceId ? undefined : (view, files) => handlers.current.insertImages(view, files),
    onBoard: quick || guest || !spaceId ? undefined : (target) => handlers.current.addBoard(target),
    pageLinks: !guest,
    onCopyBlock: (id) => handlers.current.copyBlock(id),
  }), [guest, quick, spaceId]);

  const editor = useEditor(
    {
      editable: editable && !blocked,
      extensions: [
        ...pageContent(connection.guest ? undefined : auth.request, noteId),
        Placeholder.configure({ placeholder: editable ? 'Start writing…' : '' }),
        Collaboration.configure({ document: connection.document }),
        CollaborationCaret.configure({ provider: connection.provider, user: { name: user.displayName, color: colorFor(user.id) } }),
        blockMenuExtension(actions),
        BlockMoves,
        CommentedBlocks,
      ],
      editorProps: {
        attributes: { 'aria-label': 'Page content', class: 'note-content' },
        handleClickOn: (_view, _position, node) => {
          const path = internalPath(node.attrs.href);
          if (connection.guest || node.type.name !== 'mention' || !path) return false;
          navigate(path);
          return true;
        },
        handlePaste: (view, event, slice) => handlers.current.insert(view, [...(event.clipboardData?.files ?? [])], slice),
        handleDrop: (view, event, slice) => handlers.current.insert(view, [...((event as DragEvent).dataTransfer?.files ?? [])], slice),
      },
    },
    [connection],
  );

  async function copyBlock(id: string) {
    const link = new URL(window.location.href);
    link.hash = `block-${id}`;
    try {
      await navigator.clipboard.writeText(link.href);
      show({ message: 'Block link copied.' });
    } catch {
      setBlockLink(link.href);
    }
  }

  function addBoard(target: Editor) {
    auth
      .request<{ id: string }>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify({ board: true, parentId: noteId, title: 'Board' }) })
      .then(
        (board) => target.chain().focus().insertContent({ type: 'boardEmbed', attrs: { boardId: board.id } }).run(),
        () => show({ message: 'Could not add a board.', tone: 'error' }),
      );
  }

  function insert(view: EditorView, files: File[], slice: Slice) {
    if (insertImages(view, files)) return true;
    if (new Blob([JSON.stringify(slice.content.toJSON())]).size <= maxInsertBytes) return false;
    show({ message: 'That is too much to add at once. Add it in smaller parts.', tone: 'error' });
    return true;
  }

  function insertImages(view: EditorView, files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!editable || connection.guest || !spaceId || images.length === 0) return false;
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
    editor?.setEditable(editable && !blocked);
  }, [editor, editable, blocked]);

  const commented = (commentedBlocks ?? []).join(' ');
  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(commentedBlocksKey, new Set(commented ? commented.split(' ') : [])).setMeta('addToHistory', false));
  }, [editor, commented]);

  if (!editor) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return (
    <div className="note-editor relative grid min-w-0 grid-cols-1 gap-3" onDragStartCapture={(event) => event.preventDefault()}>
      <div className={`note-editor-header ${editable && !blocked ? 'sticky top-(--header-height) z-10 bg-paper py-2' : ''}`}>
        <LiveStatus connection={connection} editable={editable} editor={editor} noteId={noteId} onBlocked={setBlocked} />
        {editable && !blocked && <Toolbar actions={actions} editor={editor} onComment={onComment} quick={quick} />}
      </div>
      {editable && !blocked && <BlockHandle actions={actions} editor={editor} onComment={onComment} />}
      <PageBlockTarget editor={editor} provider={connection.provider} />
      <EditorContent editor={editor} />
      {blockLink && <Dialog onClose={() => setBlockLink(undefined)} title="Link to block"><div className="mt-5"><Copyable value={blockLink} /></div></Dialog>}
    </div>
  );
}

function HoldHandle({ held }: { held: RefObject<boolean> }) {
  useEffect(() => {
    held.current = true;
    return () => {
      held.current = false;
    };
  }, [held]);
  return null;
}

const BlockHandle = memo(function BlockHandle({ actions, editor, onComment }: { actions: BlockActions; editor: Editor; onComment?: (block: QuotedBlock) => void }) {
  const [block, setBlock] = useState<Block & { top: number; left: number }>();
  const held = useRef(false);

  useEffect(() => {
    const area = editor.view.dom.closest<HTMLElement>('.note-editor');
    if (!area) return;
    let frame = 0;
    const point = (event: MouseEvent) => {
      if (held.current) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const at = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!at) return;
        const target = at.inside >= 0 ? at.inside : at.pos;
        const resolved = editor.state.doc.resolve(target);
        const pos = resolved.depth ? resolved.before(1) : target;
        const node = editor.state.doc.nodeAt(pos);
        const dom = node && editor.view.nodeDOM(pos);
        if (!node || !(dom instanceof HTMLElement)) return;
        const box = dom.getBoundingClientRect();
        const bounds = area.getBoundingClientRect();
        setBlock({ node, pos, top: box.top - bounds.top, left: box.left - bounds.left });
      });
    };
    const leave = () => {
      window.cancelAnimationFrame(frame);
      if (!held.current) setBlock(undefined);
    };
    const changed = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged) return;
      if (!held.current) setBlock(undefined);
      else setBlock((current) => {
        const moved = current && relocate(transaction.doc, current, transaction.mapping);
        return moved && { ...current, ...moved };
      });
    };
    area.addEventListener('mousemove', point);
    area.addEventListener('mouseleave', leave);
    editor.on('transaction', changed);
    return () => {
      window.cancelAnimationFrame(frame);
      area.removeEventListener('mousemove', point);
      area.removeEventListener('mouseleave', leave);
      editor.off('transaction', changed);
    };
  }, [editor]);

  if (!block || block.node.type.name === 'paragraph') return null;
  return (
    <div className="absolute z-10 -translate-x-full" style={{ top: block.top, left: block.left }}>
      <Menu
        header={<HoldHandle held={held} />}
        items={blockItems(editor, actions, block, onComment)}
        label="Block actions"
        trigger="⠿"
        triggerClassName="note-block-handle"
        triggerLabel="Move or change this block"
      />
    </div>
  );
});

export default function NoteEditor({ editable, noteId, quick, spaceId, ...hooks }: { editable: boolean; noteId: string; quick: boolean; spaceId: string } & CommentHooks) {
  const connection = useLiveDocument(noteId, { localDrafts: editable });
  if (!connection) return <LinesSkeleton label="Loading the editor" lines={6} />;
  return <CollaborativeEditor connection={connection} editable={editable} noteId={noteId} quick={quick} spaceId={spaceId} {...hooks} />;
}
