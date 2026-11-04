import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FloatingToolbar, LinesSkeleton, ToolbarButton, ToolbarSeparator, type IconName } from '@project-graphite/ui';
import { Extension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { cspNonce } from '../csp-nonce';
import type { Member } from '../spaces';
import { LinkActions } from './LinkActions';

export type RichDocument = Record<string, unknown> | null;

interface Mention {
  from: number;
  to: number;
  query: string;
  index: number;
}

const mentionToken = /(^|[^\w@])(@[a-z0-9][a-z0-9_-]*)/gi;

const MentionTokens = Extension.create({
  name: 'mentionTokens',
  addProseMirrorPlugins: () => [
    new Plugin({
      props: {
        decorations: (state) => {
          const tokens: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText || node.marks.some((mark) => mark.type.name === 'code')) return;
            for (const match of node.text!.matchAll(mentionToken)) {
              const from = pos + match.index + match[1]!.length;
              tokens.push(Decoration.inline(from, from + match[2]!.length, { class: 'mention-token' }));
            }
          });
          return DecorationSet.create(state.doc, tokens);
        },
      },
    }),
  ],
});

const extensions = (placeholder: string) => [
  StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ['https', 'http', 'mailto'] } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  MentionTokens,
  Placeholder.configure({ placeholder }),
];

interface Format {
  label: string;
  icon?: IconName;
  glyph?: ReactNode;
  isActive?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
  separated?: boolean;
  history?: boolean;
}

const formatting: Format[] = [
  { label: 'Undo', icon: 'undo', history: true, run: (editor) => editor.chain().focus().undo().run() },
  { label: 'Redo', icon: 'redo', history: true, run: (editor) => editor.chain().focus().redo().run() },
  { label: 'Heading', icon: 'heading-1', separated: true, isActive: (editor) => editor.isActive('heading', { level: 2 }), run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Subheading', icon: 'heading-2', isActive: (editor) => editor.isActive('heading', { level: 3 }), run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Bold', icon: 'bold', separated: true, isActive: (editor) => editor.isActive('bold'), run: (editor) => editor.chain().focus().toggleBold().run() },
  { label: 'Italic', icon: 'italic', isActive: (editor) => editor.isActive('italic'), run: (editor) => editor.chain().focus().toggleItalic().run() },
  { label: 'Underline', glyph: <span className="underline">U</span>, isActive: (editor) => editor.isActive('underline'), run: (editor) => editor.chain().focus().toggleUnderline().run() },
  { label: 'Strikethrough', glyph: <span className="line-through">S</span>, isActive: (editor) => editor.isActive('strike'), run: (editor) => editor.chain().focus().toggleStrike().run() },
  { label: 'Inline code', glyph: <span className="font-mono">{'</>'}</span>, isActive: (editor) => editor.isActive('code'), run: (editor) => editor.chain().focus().toggleCode().run() },
  { label: 'Highlight', icon: 'highlight', isActive: (editor) => editor.isActive('highlight'), run: (editor) => editor.chain().focus().toggleHighlight().run() },
  { label: 'Bulleted list', icon: 'list', separated: true, isActive: (editor) => editor.isActive('bulletList'), run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: 'list-ordered', isActive: (editor) => editor.isActive('orderedList'), run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { label: 'Checklist', icon: 'checklist', isActive: (editor) => editor.isActive('taskList'), run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { label: 'Quote', icon: 'quote', isActive: (editor) => editor.isActive('blockquote'), run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { label: 'Code block', icon: 'code', isActive: (editor) => editor.isActive('codeBlock'), run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { label: 'Divider', glyph: <span aria-hidden="true">—</span>, run: (editor) => editor.chain().focus().setHorizontalRule().run() },
];

function Toolbar({ compact, editor }: { compact: boolean; editor: Editor }) {
  const formats = compact ? formatting.filter((format) => !format.history) : formatting;
  const active = useEditorState({ editor, selector: ({ editor: current }) => formats.map((format) => Boolean(format.isActive?.(current))) });
  return (
    <FloatingToolbar className="rich-editor-toolbar" label="Formatting">
      {formats.map((format, index) => [
        format.separated && index > 0 && <ToolbarSeparator key={`${format.label}-separator`} />,
        format.icon ? (
          <ToolbarButton active={active[index]} icon={format.icon} key={format.label} label={format.label} onClick={() => format.run(editor)} />
        ) : (
          <ToolbarButton active={active[index]} key={format.label} label={format.label} onClick={() => format.run(editor)}>
            {format.glyph}
          </ToolbarButton>
        ),
      ])}
    </FloatingToolbar>
  );
}

export function RichTextEditor({
  autoFocus = false,
  compact = false,
  label,
  mentions,
  onChange,
  placeholder,
  value,
}: {
  autoFocus?: boolean;
  compact?: boolean;
  label: string;
  mentions?: Member[];
  onChange: (document: RichDocument, text: string) => void;
  placeholder: string;
  value: RichDocument;
}) {
  const latest = useRef(onChange);
  latest.current = onChange;
  const [mention, setMention] = useState<Mention>();
  const suggestions = mention
    ? (mentions ?? []).filter((person) => person.handle.startsWith(mention.query) || person.displayName.toLowerCase().includes(mention.query)).slice(0, 6)
    : [];
  const live = useRef<{ mention?: Mention; suggestions: Member[]; mentions?: Member[]; insert?: (person: Member) => void }>({ suggestions });
  live.current.mention = mention;
  live.current.suggestions = suggestions;
  live.current.mentions = mentions;

  const track = (current: Editor) => {
    const { from, empty } = current.state.selection;
    const match = live.current.mentions?.length && empty ? /(?:^|[^\w@])@([a-z0-9_-]{0,30})$/i.exec(current.state.doc.textBetween(Math.max(0, from - 40), from, '\n', '\0')) : null;
    setMention(match ? { from: from - match[1]!.length - 1, to: from, query: match[1]!.toLowerCase(), index: 0 } : undefined);
  };

  const editor = useEditor({
    content: value ?? undefined,
    autofocus: autoFocus ? 'end' : false,
    injectNonce: cspNonce(),
    extensions: extensions(placeholder),
    editorProps: {
      attributes: { 'aria-label': label, class: 'note-content rich-editor-content' },
      handleKeyDown: (_view, event) => {
        const { mention: open, suggestions: shown, insert } = live.current;
        if (!open || shown.length === 0) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setMention({ ...open, index: (open.index + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length });
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          insert?.(shown[open.index]!);
        } else if (event.key === 'Escape') {
          event.stopPropagation();
          setMention(undefined);
        } else return false;
        return true;
      },
    },
    onSelectionUpdate: ({ editor: current }) => track(current),
    onUpdate: ({ editor: current }) => {
      track(current);
      latest.current(current.isEmpty ? null : (current.getJSON() as RichDocument), current.getText({ blockSeparator: '\n' }).trim());
    },
  });
  live.current.insert = (person: Member) => {
    if (!editor || !mention) return;
    editor.chain().focus().insertContentAt({ from: mention.from, to: mention.to }, `@${person.handle} `).run();
    setMention(undefined);
  };
  if (!editor) return <LinesSkeleton label={`Loading the ${label.toLowerCase()}`} lines={3} />;
  return (
    <div className="relative">
      <div className="rich-editor" data-compact={compact || undefined}>
        <Toolbar compact={compact} editor={editor} />
        <EditorContent editor={editor} />
      </div>
      <LinkActions editor={editor} />
      {suggestions.length > 0 && (
        <ul
          aria-label="People to mention"
          className="quick-suggestions mention-suggestions"
          ref={(list) => {
            if (!list || !mention) return;
            const caret = editor.view.coordsAtPos(mention.from);
            const frame = list.parentElement!.getBoundingClientRect();
            list.style.top = `${caret.bottom - frame.top + 6}px`;
            list.style.left = `${Math.max(0, Math.min(caret.left - frame.left, frame.width - list.offsetWidth))}px`;
            list.scrollIntoView({ block: 'nearest' });
          }}
          role="listbox"
        >
          {suggestions.map((person, index) => (
            <li
              aria-selected={index === mention!.index}
              className="quick-suggestion"
              key={person.userId}
              onMouseDown={(event) => {
                event.preventDefault();
                live.current.insert?.(person);
              }}
              role="option"
            >
              <span className="min-w-0 truncate text-ink">{person.displayName}</span>
              <span className="shrink-0 text-small text-muted">@{person.handle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RichTextView({ value }: { value: RichDocument }) {
  const editor = useEditor({
    content: value ?? undefined,
    editable: false,
    injectNonce: cspNonce(),
    extensions: extensions(''),
    editorProps: { attributes: { class: 'note-content rich-text-view' } },
  });
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(value ?? '', { emitUpdate: false });
  }, [editor, value]);
  return (
    editor && (
      <>
        <EditorContent editor={editor} />
        <LinkActions editor={editor} />
      </>
    )
  );
}
