import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import { NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type NodeViewProps } from '@tiptap/react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { itemHref } from '../spaces';

export interface MentionCandidate {
  id: string;
  label: string;
  href: string;
  hint: string;
}

interface SearchReply {
  items: { id: string; spaceId: string; spaceName: string; kind: string; title: string }[];
}

type Request = ReturnType<typeof useAuth>['request'];

interface ListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const MentionList = forwardRef<ListHandle, SuggestionProps<MentionCandidate>>(function MentionList({ command, items }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') setActive((current) => (current + 1) % items.length);
      else if (event.key === 'ArrowUp') setActive((current) => (current - 1 + items.length) % items.length);
      else if (event.key === 'Enter') command({ id: items[active]!.id, label: items[active]!.label, href: items[active]!.href } as never);
      else return false;
      return true;
    },
  }));
  return (
    <div className="mention-menu" role="listbox">
      {items.length === 0 ? (
        <p className="m-0 px-3 py-2 text-sm text-muted">Nothing matches</p>
      ) : (
        items.map((item, index) => (
          <button
            aria-selected={index === active}
            className="mention-option"
            key={item.id}
            onClick={() => command({ id: item.id, label: item.label, href: item.href } as never)}
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

export const storedFileId = (fileId: unknown) =>
  typeof fileId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId) ? fileId : null;

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
      render: () => {
        let renderer: ReactRenderer<ListHandle, SuggestionProps<MentionCandidate>> | undefined;
        const place = (props: SuggestionProps<MentionCandidate>) => {
          const box = props.clientRect?.();
          const element = renderer?.element as HTMLElement | undefined;
          if (!box || !element) return;
          element.style.position = 'fixed';
          element.style.left = `${box.left}px`;
          element.style.top = `${box.bottom + 6}px`;
          element.style.zIndex = '50';
        };
        return {
          onStart: (props) => {
            renderer = new ReactRenderer(MentionList, { props, editor: props.editor });
            document.body.append(renderer.element);
            place(props);
          },
          onUpdate: (props) => {
            renderer?.updateProps(props);
            place(props);
          },
          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = undefined;
              return true;
            }
            return renderer?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            renderer?.destroy();
            renderer?.element.remove();
            renderer = undefined;
          },
        };
      },
    },
  });
}

function StoredImage({ node, selected }: NodeViewProps) {
  const { request } = useAuth();
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  const fileId = storedFileId(node.attrs.fileId);

  useEffect(() => {
    if (!fileId) return;
    let url = '';
    let cancelled = false;
    request<Blob>(`/files/${fileId}`, {}, readBlob).then(
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
  }, [fileId, request]);

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
