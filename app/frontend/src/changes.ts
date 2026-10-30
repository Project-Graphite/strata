export type Topic = 'items' | 'tasks' | 'subscriptions' | 'spaces' | 'inbox' | 'spending' | 'habits' | 'journal' | 'dashboards' | 'pages' | 'page-details' | 'page-comments' | 'page-databases' | 'task-details';

export interface Change {
  spaceId?: string;
  itemId?: string;
  topic: Topic;
}

type AuthenticatedRequest = (path: string, init: RequestInit, read: (response: Response) => Promise<unknown>) => Promise<unknown>;

const listeners = new Set<(change?: Change) => void>();
let otherTabs: BroadcastChannel | undefined;

function emit(change?: Change) {
  for (const listener of listeners) listener(change);
}

export function onChange(listener: (change?: Change) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceChange() {
  emit();
  otherTabs?.postMessage('changed');
}

async function readChanges(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const events = buffer.split('\n\n');
    buffer = events.pop()!;
    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('\n');
      if (data) emit(JSON.parse(data) as Change);
    }
  }
}

export function watchChanges(request: AuthenticatedRequest) {
  const channel = new BroadcastChannel('strata-changes');
  channel.onmessage = () => emit();
  otherTabs = channel;
  let connection: AbortController | undefined;
  let retry: number | undefined;
  let failures = 0;

  function connect() {
    pause();
    const controller = new AbortController();
    connection = controller;
    void request('/me/changes', { signal: controller.signal, headers: { Accept: 'text/event-stream' } }, (response) => {
      failures = 0;
      return readChanges(response);
    })
      .catch(() => {
        failures += 1;
      })
      .then(() => {
        if (!controller.signal.aborted) retry = window.setTimeout(connect, Math.min(1_000 * 2 ** failures, 30_000));
      });
  }

  function pause() {
    window.clearTimeout(retry);
    connection?.abort();
  }

  function follow() {
    if (document.visibilityState === 'visible') connect();
    else pause();
  }

  document.addEventListener('visibilitychange', follow);
  const idle = window.requestIdleCallback ? window.requestIdleCallback(follow) : undefined;
  if (idle === undefined) follow();
  return () => {
    document.removeEventListener('visibilitychange', follow);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    pause();
    channel.close();
    otherTabs = undefined;
  };
}
