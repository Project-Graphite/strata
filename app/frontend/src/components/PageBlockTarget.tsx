import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import type { Editor } from '@tiptap/react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { showPageBlock } from './page-blocks';

export function PageBlockTarget({ editor, provider }: { editor: Editor; provider: HocuspocusProvider }) {
  const { hash } = useLocation();
  const [missing, setMissing] = useState(false);

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

  return missing ? <p className="m-0 text-sm text-muted" role="status">This linked block is no longer on this page.</p> : null;
}
