import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { FloatingToolbar, Icon, IconButton, TextField, ToolbarButton, useSnackbar } from '@project-graphite/ui';
import { Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { fileSize, saveBlob } from '../files';
import { Button } from './Button';
import { useFileSource } from './file-source';
import { FormDialog } from './FormDialog';
import { showPageBlock } from './page-blocks';

const PdfViewer = lazy(() => import('./PdfViewer'));

export const uuidOrNull = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;

export const alignments = [
  ['left', 'Align left'],
  ['center', 'Align centre'],
  ['right', 'Align right'],
] as const;

type Alignment = (typeof alignments)[number][0];

export function AlignGlyph({ align }: { align: Alignment }) {
  const start = (width: number) => (align === 'left' ? 2 : align === 'right' ? 14 - width : 8 - width / 2);
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" viewBox="0 0 16 16" width="16">
      {[12, 8, 12, 6].map((width, index) => (
        <line key={index} x1={start(width)} x2={start(width) + width} y1={3 + index * 3.3} y2={3 + index * 3.3} />
      ))}
    </svg>
  );
}

export function GlyphButton({ active, children, label, onClick }: { active?: boolean; children: ReactNode; label: string; onClick: () => void }) {
  return (
    <ToolbarButton active={active} label={label} onClick={onClick}>
      <span aria-hidden="true" className="inline-flex items-center gap-1">{children}</span>
      <span className="sr-only">{label}</span>
    </ToolbarButton>
  );
}

export function AltTextDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (alt: string) => void }) {
  return (
    <FormDialog
      busy={false}
      busyLabel=""
      onClose={onClose}
      onSubmit={(form) => {
        onSave(String(new FormData(form).get('alt')).trim());
        onClose();
      }}
      submitLabel="Save description"
      title="Describe this image"
    >
      <TextField autoFocus defaultValue={initial} hint="Screen readers read this aloud in place of the image." label="Description" maxLength={500} name="alt" />
    </FormDialog>
  );
}

function useEditable(editor: Editor) {
  return useSyncExternalStore(
    (changed) => {
      editor.on('update', changed);
      return () => {
        editor.off('update', changed);
      };
    },
    () => editor.isEditable,
  );
}

const minImageWidth = 15;
const imageWidth = (value: unknown) => (typeof value === 'number' && value >= minImageWidth && value <= 100 ? value : null);
const alignmentOf = (value: unknown): Alignment => alignments.find(([align]) => align === value)?.[0] ?? 'center';

function StoredImage({ editor, node, selected, updateAttributes }: NodeViewProps) {
  const load = useFileSource();
  const frame = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [dragged, setDragged] = useState<number>();
  const fileId = uuidOrNull(node.attrs.fileId);
  const align = alignmentOf(node.attrs.align);
  const width = dragged ?? imageWidth(node.attrs.width);
  const caption = typeof node.attrs.caption === 'string' ? node.attrs.caption : '';
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const editing = useEditable(editor);

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

  const widthFrom = (pixels: number) => Math.round(Math.min(100, Math.max(minImageWidth, (pixels / frame.current!.parentElement!.clientWidth) * 100)));

  function resize(event: PointerEvent<HTMLSpanElement>) {
    const handle = event.currentTarget;
    const start = { x: event.clientX, width: frame.current!.getBoundingClientRect().width };
    const factor = align === 'center' ? 2 : align === 'right' ? -1 : 1;
    let latest = widthFrom(start.width);
    const move = (moved: globalThis.PointerEvent) => {
      latest = widthFrom(start.width + (moved.clientX - start.x) * factor);
      setDragged(latest);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      setDragged(undefined);
      updateAttributes({ width: latest });
    };
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function nudge(event: KeyboardEvent<HTMLSpanElement>) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 5 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 0;
    if (!step) return;
    event.preventDefault();
    updateAttributes({ width: Math.min(100, Math.max(minImageWidth, (width ?? 100) + step)) });
  }

  return (
    <NodeViewWrapper as="figure" className={`note-image ${selected ? 'is-selected' : ''}`} data-align={align}>
      <div className="note-image-frame" ref={frame} style={width ? { width: `${width}%` } : undefined}>
        {failed || !fileId ? (
          <span className="text-small text-muted">This image is no longer available.</span>
        ) : source ? (
          <img alt={alt} src={source} />
        ) : (
          <span aria-hidden="true" className="skeleton block h-40 w-full" />
        )}
        {editing && selected && (
          <>
            <FloatingToolbar className="note-image-tools" label="Image">
              {alignments.map(([option, label]) => (
                <GlyphButton active={align === option} key={option} label={label} onClick={() => updateAttributes({ align: option })}>
                  <AlignGlyph align={option} />
                </GlyphButton>
              ))}
              <ToolbarButton label="Describe the image" onClick={() => setDescribing(true)}>Alt text</ToolbarButton>
            </FloatingToolbar>
            <span
              aria-label="Image width"
              aria-valuemax={100}
              aria-valuemin={minImageWidth}
              aria-valuenow={width ?? 100}
              aria-valuetext={`${width ?? 100}% of the page width`}
              className="note-image-resize"
              data-side={align === 'right' ? 'start' : 'end'}
              onKeyDown={nudge}
              onPointerDown={resize}
              role="slider"
              tabIndex={0}
            />
          </>
        )}
      </div>
      {editing ? (
        <figcaption>
          <input aria-label="Caption" className="note-image-caption" maxLength={300} onChange={(event) => updateAttributes({ caption: event.currentTarget.value || null })} placeholder="Add a caption" value={caption} />
        </figcaption>
      ) : (
        caption && <figcaption className="note-image-caption">{caption}</figcaption>
      )}
      {describing && <AltTextDialog initial={alt} onClose={() => setDescribing(false)} onSave={(described) => updateAttributes({ alt: described })} />}
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
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => imageWidth(Number(element.getAttribute('data-width'))),
        renderHTML: (attributes: { width?: number | null }) => (attributes.width ? { 'data-width': attributes.width } : {}),
      },
      align: {
        default: 'center',
        parseHTML: (element: HTMLElement) => alignmentOf(element.getAttribute('data-align')),
        renderHTML: (attributes: { align?: string }) => ({ 'data-align': attributes.align }),
      },
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-caption'),
        renderHTML: (attributes: { caption?: string | null }) => (attributes.caption ? { 'data-caption': attributes.caption } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(StoredImage);
  },
});

function FileAttachment({ editor, node, selected, updateAttributes }: NodeViewProps) {
  const load = useFileSource();
  const show = useSnackbar();
  const fileId = uuidOrNull(node.attrs.fileId);
  const name = typeof node.attrs.name === 'string' && node.attrs.name ? node.attrs.name : 'File';
  const pdf = node.attrs.mimeType === 'application/pdf';
  const preview = pdf && node.attrs.preview === true;
  const editing = useEditable(editor);
  const details = [pdf ? 'PDF' : null, typeof node.attrs.size === 'number' ? fileSize(node.attrs.size) : null].filter(Boolean).join(' · ');

  return (
    <NodeViewWrapper className={`note-file ${selected ? 'is-selected' : ''}`}>
      <div className="note-file-row">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-field border border-line text-muted">
          <Icon name="file" size={18} />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-ink">{name}</span>
          <span className="text-small text-muted">{fileId ? details : 'This file is no longer available.'}</span>
        </span>
        {fileId && pdf && editing && <Button label={preview ? 'Hide preview' : 'Show preview'} onClick={() => updateAttributes({ preview: !preview })} />}
        {fileId && (
          <IconButton
            icon="download"
            label={`Download ${name}`}
            onClick={() => load(fileId).then((blob) => saveBlob(blob, name), () => show({ message: `Could not download ${name}.`, tone: 'error' }))}
          />
        )}
      </div>
      {fileId && preview && (
        <Suspense fallback={<span aria-hidden="true" className="skeleton block h-64 w-full" />}>
          <PdfViewer fileId={fileId} name={name} />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}

export const FileAttachmentExtension = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  addAttributes: () => ({
    fileId: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-file-id'), renderHTML: (attributes: { fileId?: string | null }) => ({ 'data-file-id': attributes.fileId }) },
    name: { default: null, rendered: false },
    size: { default: null, rendered: false },
    mimeType: { default: null, rendered: false },
    preview: { default: false, rendered: false },
  }),
  parseHTML: () => [{ tag: 'div[data-file-attachment]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['div', { ...HTMLAttributes, 'data-file-attachment': '' }, String(node.attrs.name ?? 'File')],
  addNodeView: () => ReactNodeViewRenderer(FileAttachment),
});

export function webAddress(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  addAttributes: () => ({
    url: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('href'), renderHTML: () => ({}) },
    title: { default: null, rendered: false },
    description: { default: null, rendered: false },
    siteName: { default: null, rendered: false },
  }),
  parseHTML: () => [{ tag: 'a[data-link-card]' }],
  renderHTML: ({ HTMLAttributes, node }) => {
    const url = webAddress(node.attrs.url);
    const site = String(node.attrs.siteName || url?.hostname.replace(/^www\./, '') || 'Link');
    return [
      'a',
      { ...HTMLAttributes, 'data-link-card': '', class: 'note-link-card', href: url?.href, target: '_blank', rel: 'noopener noreferrer nofollow' },
      ['span', { class: 'note-link-card-title' }, String(node.attrs.title || site)],
      ...(node.attrs.description ? [['span', { class: 'note-link-card-description' }, String(node.attrs.description)]] : []),
      ['span', { class: 'note-link-card-site' }, site],
    ];
  },
});

export const Video = Youtube.configure({
  addPasteHandler: false,
  nocookie: true,
  rel: 0,
  HTMLAttributes: {
    class: 'note-video',
    title: 'YouTube video',
    loading: 'lazy',
    referrerpolicy: 'strict-origin-when-cross-origin',
    sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
  },
});

interface Heading {
  id: string | null;
  level: number;
  text: string;
}

function headingsOf(doc: ProseMirrorNode) {
  const found: Heading[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'heading' && node.textContent.trim()) {
      found.push({ id: typeof node.attrs.id === 'string' ? node.attrs.id : null, level: Number(node.attrs.level), text: node.textContent.trim() });
    }
    return !node.isTextblock;
  });
  return found;
}

const sameHeadings = (a: Heading[], b: Heading[]) => a.length === b.length && a.every((heading, index) => heading.id === b[index]!.id && heading.level === b[index]!.level && heading.text === b[index]!.text);

function TableOfContentsView({ editor }: NodeViewProps) {
  const [headings, setHeadings] = useState(() => headingsOf(editor.state.doc));

  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = headingsOf(editor.state.doc);
        setHeadings((current) => (sameHeadings(current, next) ? current : next));
      }, 200);
    };
    editor.on('update', update);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', update);
    };
  }, [editor]);

  const top = Math.min(...headings.map((heading) => heading.level));
  return (
    <NodeViewWrapper className="note-toc">
      <nav aria-label="Table of contents">
        <p className="m-0 text-micro text-faint">Contents</p>
        {headings.length ? (
          <ol>
            {headings.map((heading, index) => (
              <li key={heading.id ?? index} style={{ paddingInlineStart: `${heading.level - top}rem` }}>
                <button onClick={() => heading.id && showPageBlock(heading.id)} type="button">{heading.text}</button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-small text-muted">Add headings to this page to fill the contents.</p>
        )}
      </nav>
    </NodeViewWrapper>
  );
}

export const TableOfContentsBlock = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  parseHTML: () => [{ tag: 'nav[data-table-of-contents]' }],
  renderHTML: () => ['nav', { 'data-table-of-contents': '' }],
  addNodeView: () => ReactNodeViewRenderer(TableOfContentsView),
});
