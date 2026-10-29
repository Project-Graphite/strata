import { useEffect } from 'react';

export const pageBlock = (id: string) => document.querySelector<HTMLElement>(`.note-content [data-id="${CSS.escape(id)}"]`);

const commentAnchors = (id: string) => [...document.querySelectorAll<HTMLElement>(`.note-content [data-comment="${CSS.escape(id)}"]`)];

const commentAnchor = (id: string) => pageBlock(id) ?? commentAnchors(id)[0];

export const pageAnchorText = (id: string) => pageBlock(id)?.textContent ?? commentAnchors(id).map((anchor) => anchor.textContent).join('');

export function showPageBlock(id: string) {
  const block = commentAnchor(id);
  if (!block) return false;
  for (let parent = block.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  block.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  block.animate([{ backgroundColor: 'var(--color-line-soft)' }, { backgroundColor: 'transparent' }], { duration: 1600 });
  return true;
}

export function useAlignedThreads(margin: HTMLElement | null) {
  useEffect(() => {
    const body = margin?.parentElement;
    if (!margin || !body) return;
    const wide = window.matchMedia('(min-width: 80rem)');
    let frame = 0;
    const align = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const threads = [...margin.querySelectorAll<HTMLElement>('[data-block-id]')];
        for (const thread of threads) {
          thread.style.removeProperty('order');
          thread.style.removeProperty('margin-top');
        }
        if (!wide.matches) return;
        const placed = threads
          .flatMap((thread) => {
            const anchor = commentAnchor(thread.dataset.blockId!);
            return anchor ? [{ thread, top: anchor.getBoundingClientRect().top }] : [];
          })
          .sort((a, b) => a.top - b.top);
        placed.forEach(({ thread }, index) => thread.style.setProperty('order', String(index + 1)));
        for (const { thread, top } of placed) thread.style.setProperty('margin-top', `${Math.max(0, top - thread.getBoundingClientRect().top)}px`);
      });
    };
    const resized = new ResizeObserver(align);
    const observe = () => {
      resized.disconnect();
      for (const child of body.children) resized.observe(child);
    };
    const mounted = new MutationObserver(observe);
    const threads = new MutationObserver(align);
    mounted.observe(body, { childList: true });
    threads.observe(margin, { childList: true, subtree: true, characterData: true });
    wide.addEventListener('change', align);
    observe();
    return () => {
      window.cancelAnimationFrame(frame);
      resized.disconnect();
      mounted.disconnect();
      threads.disconnect();
      wide.removeEventListener('change', align);
    };
  }, [margin]);
}
