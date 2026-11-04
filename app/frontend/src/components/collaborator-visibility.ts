import { useSyncExternalStore } from 'react';

const storageKey = 'strata-hide-collaborators';
const listeners = new Set<() => void>();

let hidden = (() => {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
})();
document.documentElement.toggleAttribute('data-hide-collaborators', hidden);

export function setCollaboratorsHidden(next: boolean) {
  hidden = next;
  document.documentElement.toggleAttribute('data-hide-collaborators', next);
  for (const listener of listeners) listener();
  try {
    if (next) localStorage.setItem(storageKey, '1');
    else localStorage.removeItem(storageKey);
  } catch {
    return;
  }
}

export function useCollaboratorsHidden() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => hidden,
  );
}
