let pending: Promise<unknown> | undefined;

export function refreshSession<T>(refresh: () => Promise<T>): Promise<T> {
  pending ??= (navigator.locks ? navigator.locks.request('strata-session-refresh', refresh) : refresh()).finally(() => {
    pending = undefined;
  });
  return pending as Promise<T>;
}
