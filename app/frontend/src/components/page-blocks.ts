export const pageBlock = (id: string) => document.querySelector<HTMLElement>(`.note-content [data-id="${CSS.escape(id)}"]`);

export function showPageBlock(id: string) {
  const block = pageBlock(id);
  if (!block) return false;
  for (let parent = block.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  block.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  block.animate([{ backgroundColor: 'var(--color-line-soft)' }, { backgroundColor: 'transparent' }], { duration: 1600 });
  return true;
}
