import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Extension, mergeAttributes, Node, type ChainedCommands, type Editor } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import UniqueID from '@tiptap/extension-unique-id';
import StarterKit from '@tiptap/starter-kit';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type NodeViewProps } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import { Link } from 'react-router';
import type { useAuth } from '../auth';
import { itemHref } from '../spaces';
import { BoardPreview } from './BoardPreview';
import { useFileSource } from './file-source';

interface Candidate {
  id: string;
  label: string;
  hint: string;
}

export interface MentionCandidate extends Candidate {
  href: string;
}

export interface BlockChoice extends Candidate {
  words: string;
  run: (chain: ChainedCommands, editor: Editor) => void;
}

interface SearchReply {
  items: { id: string; spaceId: string; spaceName: string; kind: string; title: string }[];
}

type Request = ReturnType<typeof useAuth>['request'];

interface ListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const SuggestionList = forwardRef<ListHandle, SuggestionProps<Candidate>>(function SuggestionList({ command, items }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') setActive((current) => (current + 1) % items.length);
      else if (event.key === 'ArrowUp') setActive((current) => (current - 1 + items.length) % items.length);
      else if (event.key === 'Enter') command(items[active]!);
      else return false;
      return true;
    },
  }));
  return (
    <div className="suggestion-menu" role="listbox">
      {items.length === 0 ? (
        <p className="m-0 px-3 py-2 text-sm text-muted">Nothing matches</p>
      ) : (
        items.map((item, index) => (
          <button
            aria-selected={index === active}
            className="suggestion-option"
            key={item.id}
            onClick={() => command(item)}
            onMouseEnter={() => setActive(index)}
            role="option"
            type="button"
          >
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="mono-sm shrink-0 text-faint">{item.hint}</span>
          </button>
        ))
      )}
    </div>
  );
});

export const internalPath = (href: unknown) => (typeof href === 'string' && /^\/(?![/\\])/.test(href) ? href : null);

const uuidOrNull = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;

export const storedFileId = uuidOrNull;

function suggestionPopup<Item extends Candidate>(): ReturnType<NonNullable<SuggestionOptions<Item>['render']>> {
  let renderer: ReactRenderer<ListHandle, SuggestionProps<Candidate>> | undefined;
  const place = (props: SuggestionProps<Item>) => {
    const box = props.clientRect?.();
    const element = renderer?.element as HTMLElement | undefined;
    if (!box || !element) return;
    element.style.position = 'fixed';
    element.style.left = `${box.left}px`;
    element.style.top = `${box.bottom + 6}px`;
    element.style.zIndex = '50';
  };
  const close = () => {
    renderer?.destroy();
    renderer?.element.remove();
    renderer = undefined;
  };
  return {
    onStart: (props) => {
      const shown = new ReactRenderer(SuggestionList, { props: props as SuggestionProps<Candidate>, editor: props.editor });
      renderer = shown;
      document.body.append(shown.element);
      place(props);
    },
    onUpdate: (props) => {
      renderer?.updateProps(props as SuggestionProps<Candidate>);
      place(props);
    },
    onKeyDown: (props) => {
      if (props.event.key !== 'Escape') return renderer?.ref?.onKeyDown(props) ?? false;
      close();
      return true;
    },
    onExit: close,
  };
}

export function mentionExtension(request: Request, noteId: string) {
  return Mention.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        href: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('data-href'),
          renderHTML: (attributes: { href?: string | null }) => (attributes.href ? { 'data-href': attributes.href } : {}),
        },
      };
    },
  }).configure({
    HTMLAttributes: { class: 'mention' },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    renderHTML: ({ node, options }) => ['span', { ...options.HTMLAttributes, 'data-href': node.attrs.href }, `@${node.attrs.label ?? node.attrs.id}`],
    suggestion: {
      items: async ({ query }) => {
        if (query.trim().length < 2) return [];
        const reply = await request<SearchReply>(`/search?q=${encodeURIComponent(query.trim())}`).catch(() => ({ items: [] }));
        return reply.items
          .filter((item) => item.id !== noteId)
          .slice(0, 8)
          .map((item) => ({ id: item.id, label: item.title || 'Untitled', href: itemHref(item) ?? `/spaces/${item.spaceId}`, hint: `${item.kind} · ${item.spaceName}` }));
      },
      render: suggestionPopup,
    },
  });
}

function StoredImage({ node, selected }: NodeViewProps) {
  const load = useFileSource();
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  const fileId = storedFileId(node.attrs.fileId);

  useEffect(() => {
    if (!fileId) return;
    let url = '';
    let cancelled = false;
    load(fileId).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSource(url);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, load]);

  return (
    <NodeViewWrapper className={`note-image ${selected ? 'is-selected' : ''}`} data-drag-handle="">
      {failed || !fileId ? (
        <span className="text-sm text-muted">This image is no longer available.</span>
      ) : source ? (
        <img alt={(node.attrs.alt as string) ?? ''} src={source} />
      ) : (
        <span aria-hidden="true" className="skeleton block h-40 w-full" />
      )}
    </NodeViewWrapper>
  );
}

export const StoredImageExtension = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fileId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-file-id'),
        renderHTML: (attributes: { fileId?: string | null }) => (attributes.fileId ? { 'data-file-id': attributes.fileId } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(StoredImage);
  },
});

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'note-callout' }), 0],
});

export interface BlockActions {
  onImages: (view: Editor['view'], files: File[]) => void;
  onBoard: (editor: Editor) => void;
}

export function blockChoices({ onImages, onBoard }: BlockActions): BlockChoice[] {
  const chooseImages = (editor: Editor) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => onImages(editor.view, [...(input.files ?? [])]);
    input.click();
  };
  return [
    { id: 'text', label: 'Text', hint: 'paragraph', words: 'text paragraph plain', run: (chain) => chain.setParagraph().run() },
    { id: 'heading', label: 'Heading', hint: '#', words: 'heading title h1', run: (chain) => chain.setHeading({ level: 1 }).run() },
    { id: 'subheading', label: 'Subheading', hint: '##', words: 'subheading heading h2', run: (chain) => chain.setHeading({ level: 2 }).run() },
    { id: 'bullets', label: 'Bulleted list', hint: '-', words: 'bulleted list bullets unordered', run: (chain) => chain.toggleBulletList().run() },
    { id: 'numbers', label: 'Numbered list', hint: '1.', words: 'numbered list ordered numbers', run: (chain) => chain.toggleOrderedList().run() },
    { id: 'checklist', label: 'Checklist', hint: '[]', words: 'checklist todo tasks checkbox', run: (chain) => chain.toggleTaskList().run() },
    { id: 'quote', label: 'Quote', hint: '>', words: 'quote blockquote', run: (chain) => chain.toggleBlockquote().run() },
    { id: 'code', label: 'Code block', hint: '```', words: 'code block snippet', run: (chain) => chain.toggleCodeBlock().run() },
    { id: 'callout', label: 'Callout', hint: 'note', words: 'callout note tip warning box', run: (chain) => chain.toggleWrap('callout').run() },
    { id: 'toggle', label: 'Toggle', hint: 'fold', words: 'toggle collapse fold details', run: (chain) => chain.setDetails().run() },
    { id: 'table', label: 'Table', hint: '3 × 3', words: 'table grid rows columns', run: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'divider', label: 'Divider', hint: '---', words: 'divider line separator rule', run: (chain) => chain.setHorizontalRule().run() },
    {
      id: 'image',
      label: 'Image',
      hint: 'upload',
      words: 'image picture photo upload',
      run: (chain, editor) => {
        chain.run();
        chooseImages(editor);
      },
    },
    {
      id: 'board',
      label: 'Board',
      hint: 'whiteboard',
      words: 'board whiteboard drawing sketch canvas diagram',
      run: (chain, editor) => {
        chain.run();
        onBoard(editor);
      },
    },
    { id: 'link', label: 'Link to a page', hint: '@', words: 'link page mention reference', run: (chain) => chain.insertContent('@').run() },
  ];
}

export function blockMenuExtension(actions: BlockActions) {
  const choices = blockChoices(actions);
  return Extension.create({
    name: 'blockMenu',
    addProseMirrorPlugins() {
      return [
        Suggestion<BlockChoice>({
          editor: this.editor,
          char: '/',
          items: ({ query }) => {
            const wanted = query.trim().toLowerCase();
            return choices.filter((choice) => choice.label.toLowerCase().includes(wanted) || choice.words.includes(wanted));
          },
          command: ({ editor, range, props }) => props.run(editor.chain().focus().deleteRange(range), editor),
          render: suggestionPopup,
        }),
      ];
    },
  });
}

function BoardEmbed({ node }: NodeViewProps) {
  const boardId = uuidOrNull(node.attrs.boardId);
  return (
    <NodeViewWrapper className="note-board" data-drag-handle="">
      {boardId ? (
        <>
          <BoardPreview boardId={boardId} label="Board preview" />
          <Link className="note-board-open" contentEditable={false} to={`/notes/${boardId}`}>
            Open board
          </Link>
        </>
      ) : (
        <p className="m-0 text-sm text-muted">This board is missing</p>
      )}
    </NodeViewWrapper>
  );
}

export const BoardEmbedExtension = Node.create({
  name: 'boardEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    boardId: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-board'),
      renderHTML: (attributes: { boardId?: string | null }) => ({ 'data-board': attributes.boardId }),
    },
  }),
  parseHTML: () => [{ tag: 'div[data-board]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', HTMLAttributes],
  addNodeView: () => ReactNodeViewRenderer(BoardEmbed),
});

export const commentedBlocksKey = new PluginKey<Set<string>>('commentedBlocks');

export const CommentedBlocks = Extension.create({
  name: 'commentedBlocks',
  addProseMirrorPlugins: () => [
    new Plugin<Set<string>>({
      key: commentedBlocksKey,
      state: {
        init: () => new Set(),
        apply: (transaction, current) => (transaction.getMeta(commentedBlocksKey) as Set<string> | undefined) ?? current,
      },
      props: {
        decorations(state) {
          const commented = commentedBlocksKey.getState(state);
          if (!commented?.size) return null;
          const marks: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (typeof node.attrs.id === 'string' && commented.has(node.attrs.id)) marks.push(Decoration.node(pos, pos + node.nodeSize, { class: 'has-comments' }));
          });
          return DecorationSet.create(state.doc, marks);
        },
      },
    }),
  ],
});

const blockTypes = ['paragraph', 'heading', 'blockquote', 'codeBlock', 'callout', 'details', 'table', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'image', 'boardEmbed', 'horizontalRule'];

export function pageContent(request: Request, noteId: string) {
  return [
    StarterKit.configure({ undoRedo: false, link: { openOnClick: true, autolink: true, protocols: ['https', 'http', 'mailto'] } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    Callout,
    Details.configure({ persist: true, HTMLAttributes: { class: 'note-toggle' } }),
    DetailsSummary,
    DetailsContent,
    TableKit.configure({ table: { resizable: false } }),
    mentionExtension(request, noteId),
    BoardEmbedExtension,
    StoredImageExtension,
    UniqueID.configure({ types: blockTypes, filterTransaction: (transaction) => !isChangeOrigin(transaction) }),
  ];
}

