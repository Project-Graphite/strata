import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useSnackbar } from '@project-graphite/ui';
import type { Connection } from './live-document';
import { pageBlock, showPageBlock } from './page-blocks';

export function usePageFollowing(editor: Editor | null, connection: Connection, enabled: boolean) {
  const show = useSnackbar();
  const [positions, setPositions] = useState<Map<string, string>>(new Map());
  const [following, setFollowing] = useState<string>();
  const followingRef = useRef(following);
  const positionsRef = useRef(positions);
  followingRef.current = following;
  positionsRef.current = positions;

  useEffect(() => {
    if (!editor || !enabled) return;
    const awareness = connection.provider.awareness;
    if (!awareness) return;
    let frame: number | undefined;
    let returned = true;
    const publish = () => {
      frame = undefined;
      if (followingRef.current || document.visibilityState !== 'visible') return;
      const bounds = editor.view.dom.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.right <= 0 || bounds.left >= window.innerWidth) return;
      for (let top = Math.max(8, bounds.top + 8); top < Math.min(window.innerHeight, bounds.bottom); top += 16) {
        const visible = document.elementFromPoint(Math.max(0, Math.min(window.innerWidth - 1, bounds.left + bounds.width / 2)), top)?.closest<HTMLElement>('[data-id]');
        if (!visible || !editor.view.dom.contains(visible)) continue;
        if (returned || awareness.getLocalState()?.viewport?.blockId !== visible.dataset.id) connection.provider.setAwarenessField('viewport', { blockId: visible.dataset.id, updatedAt: Date.now() });
        returned = false;
        return;
      }
    };
    const schedule = () => { frame ??= window.requestAnimationFrame(publish); };
    const visibility = () => { returned = true; schedule(); };
    const read = () => {
      const next = new Map<string, string>();
      const updated = new Map<string, number>();
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID || typeof state.user?.id !== 'string' || typeof state.viewport?.blockId !== 'string' || state.viewport.blockId.length > 200) continue;
        const timestamp = Number.isFinite(state.viewport.updatedAt) ? state.viewport.updatedAt : 0;
        if (timestamp < (updated.get(state.user.id) ?? -1)) continue;
        updated.set(state.user.id, timestamp);
        next.set(state.user.id, state.viewport.blockId);
      }
      setPositions((current) => current.size === next.size && [...next].every(([id, block]) => current.get(id) === block) ? current : next);
    };
    const stop = () => setFollowing(undefined);
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && !(event.key.length === 1 && !event.ctrlKey && !event.metaKey) && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace', 'Delete', 'Enter'].includes(event.key)) return;
      stop();
    };
    const point = (event: PointerEvent) => { if (editor.view.dom.contains(event.target as Node)) stop(); };
    const changed = () => {
      if (followingRef.current && !pageBlock(positionsRef.current.get(followingRef.current) ?? '')) stop();
      schedule();
    };
    awareness.on('change', read);
    editor.on('update', changed);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', point, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    read();
    schedule();
    return () => {
      window.cancelAnimationFrame(frame ?? 0);
      awareness.off('change', read);
      editor.off('update', changed);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', point);
      document.removeEventListener('visibilitychange', visibility);
      connection.provider.setAwarenessField('viewport', null);
    };
  }, [editor, connection, enabled]);

  useEffect(() => {
    if (!enabled || (following && !positions.has(following))) setFollowing(undefined);
    else if (following && !showPageBlock(positions.get(following)!)) setFollowing(undefined);
  }, [enabled, following, positions]);

  function jump(id: string) {
    if (showPageBlock(positions.get(id) ?? '')) return true;
    show({ message: 'That collaborator’s block is no longer available.' });
    return false;
  }

  return {
    positions,
    following,
    onFollow: (id: string) => { if (jump(id)) setFollowing(id); },
    onStop: () => setFollowing(undefined),
    onJump: jump,
  };
}
