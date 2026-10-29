export function pageScroller() {
  const shell = document.querySelector('.app-header')?.parentElement;
  return shell && getComputedStyle(shell).overflowY === 'auto' ? shell : document.documentElement;
}
