import { useEffect, useRef, type ReactNode } from 'react';
import { FloatingToolbar, LinesSkeleton, ToolbarButton, ToolbarSeparator, type IconName } from '@project-graphite/ui';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { cspNonce } from '../csp-nonce';

export type RichDocument = Record<string, unknown> | null;

const extensions = (placeholder: string) => [
  StarterKit.configure({ link: { openOnClick: true, autolink: true, protocols: ['https', 'http', 'mailto'] } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  Placeholder.configure({ placeholder }),
];

interface Format {
  label: string;
  icon?: IconName;
  glyph?: ReactNode;
  isActive?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
  separated?: boolean;
}

const formatting: Format[] = [
  { label: 'Undo', icon: 'undo', run: (editor) => editor.chain().focus().undo().run() },
  { label: 'Redo', icon: 'redo', run: (editor) => editor.chain().focus().redo().run() },
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

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({ editor, selector: ({ editor: current }) => formatting.map((format) => Boolean(format.isActive?.(current))) });
  return (
    <FloatingToolbar className="rich-editor-toolbar" label="Formatting">
      {formatting.map((format, index) => [
        format.separated && <ToolbarSeparator key={`${format.label}-separator`} />,
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
  onChange,
  placeholder,
  value,
}: {
  autoFocus?: boolean;
  compact?: boolean;
  label: string;
  onChange: (document: RichDocument, text: string) => void;
  placeholder: string;
  value: RichDocument;
}) {
  const latest = useRef(onChange);
  latest.current = onChange;
  const editor = useEditor({
    content: value ?? undefined,
    autofocus: autoFocus ? 'end' : false,
    injectNonce: cspNonce(),
    extensions: extensions(placeholder),
    editorProps: { attributes: { 'aria-label': label, class: 'note-content rich-editor-content' } },
    onUpdate: ({ editor: current }) => latest.current(current.isEmpty ? null : (current.getJSON() as RichDocument), current.getText({ blockSeparator: '\n' }).trim()),
  });
  if (!editor) return <LinesSkeleton label={`Loading the ${label.toLowerCase()}`} lines={3} />;
  return (
    <div className="rich-editor" data-compact={compact || undefined}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
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
  return editor && <EditorContent editor={editor} />;
}
