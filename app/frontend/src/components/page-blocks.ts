export const pageBlock = (id: string) => document.querySelector<HTMLElement>(`.note-content [data-id="${CSS.escape(id)}"]`);

const commentAnchors = (id: string) => [...document.querySelectorAll<HTMLElement>(`.note-content [data-comment="${CSS.escape(id)}"]`)];

export const pageAnchorText = (id: string) => pageBlock(id)?.textContent ?? commentAnchors(id).map((anchor) => anchor.textContent).join('');

export function showPageBlock(id: string) {
  const block = pageBlock(id) ?? commentAnchors(id)[0];
  if (!block) return false;
  for (let parent = block.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  block.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  block.animate([{ backgroundColor: 'var(--color-line-soft)' }, { backgroundColor: 'transparent' }], { duration: 1600 });
  return true;
}
