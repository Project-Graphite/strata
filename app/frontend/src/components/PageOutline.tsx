import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useEditorState, type Editor } from '@tiptap/react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { showPageBlock } from './page-blocks';

export function PageOutline({ editor, provider, quick }: { editor: Editor; provider: HocuspocusProvider; quick: boolean }) {
  const { hash } = useLocation();
  const [missing, setMissing] = useState(false);
  const headings = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const entries: { id: string; title: string; level: number }[] = [];
      current.state.doc.descendants((node) => {
        if (node.type.name === 'heading' && typeof node.attrs.id === 'string') entries.push({ id: node.attrs.id, title: node.textContent || 'Untitled heading', level: node.attrs.level });
      });
      return entries;
    },
  });

  useEffect(() => {
    let frame = 0;
    let found = false;
    setMissing(false);
    const target = /^#block-([\w-]{1,64})$/.exec(hash)?.[1];
    if (!target) return;
    const find = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (found || !provider.isSynced) return;
        found = showPageBlock(target);
        setMissing(!found);
      });
    };
    find();
    provider.on('synced', find);
    editor.on('update', find);
    return () => {
      window.cancelAnimationFrame(frame);
      provider.off('synced', find);
      editor.off('update', find);
    };
  }, [editor, provider, hash]);

  return (
    <>
      {missing && <p className="m-0 text-sm text-muted" role="status">This linked block is no longer on this page.</p>}
      {!quick && headings.length > 0 && (
        <details className="rounded-field border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm text-muted">On this page</summary>
          <nav aria-label="Page outline" className="mt-3 grid gap-2">
            {headings.map((heading) => <Link className="text-sm text-ink hover:underline" key={heading.id} onClick={() => { if (hash === `#block-${heading.id}`) showPageBlock(heading.id); }} style={{ paddingInlineStart: `${(heading.level - 1) * 0.75}rem` }} to={`#block-${heading.id}`}>{heading.title}</Link>)}
          </nav>
        </details>
      )}
    </>
  );
}
