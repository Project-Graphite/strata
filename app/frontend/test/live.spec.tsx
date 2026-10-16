import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider, useAuth } from '../src/auth';
import { onChange, watchChanges, type Change } from '../src/changes';
import { useResource } from '../src/useResource';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };

function eventStream(signal?: AbortSignal | null) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  signal?.addEventListener('abort', () => controller.error(new DOMException('The stream was closed', 'AbortError')));
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    push: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
    end: () => controller.close(),
  };
}

let visibility: DocumentVisibilityState = 'visible';

function showTab(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Change stream', () => {
  it('reads nudges across chunks, skips heartbeats, and reconnects after a growing delay capped at 30 seconds', async () => {
    const streams: ReturnType<typeof eventStream>[] = [];
    const outcomes: ('stream' | 'fail')[] = ['stream', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'stream', 'stream'];
    const request = vi.fn((_path: string, init: RequestInit, read: (response: Response) => Promise<unknown>) => {
      if (outcomes.shift() === 'fail') return Promise.reject(new Error('Strata cannot be reached right now'));
      const stream = eventStream(init.signal);
      streams.push(stream);
      return read(stream.response);
    });
    const received: (Change | undefined)[] = [];
    const stopListening = onChange((change) => received.push(change));
    const stop = watchChanges(request);

    expect(request).toHaveBeenCalledWith('/me/changes', expect.objectContaining({ headers: { Accept: 'text/event-stream' } }), expect.any(Function));
    await act(async () => {
      streams[0]!.push('\n: heartbeat\n\nid: 1\ndata: {"topic":"in');
      streams[0]!.push('box"}\n\nid: 2\ndata: {"spaceId":"space-1","topic":"tasks"}\n\n');
    });
    await wait(0);
    expect(received).toEqual([{ topic: 'inbox' }, { spaceId: 'space-1', topic: 'tasks' }]);

    await act(async () => streams[0]!.end());
    await wait(999);
    expect(request).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(request).toHaveBeenCalledTimes(2);

    for (const [index, delay] of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000].entries()) {
      await wait(delay - 1);
      expect(request).toHaveBeenCalledTimes(index + 2);
      await wait(1);
      expect(request).toHaveBeenCalledTimes(index + 3);
    }

    await act(async () => streams[1]!.end());
    await wait(1_000);
    expect(request).toHaveBeenCalledTimes(9);

    stop();
    stopListening();
  });

  it('closes the stream while the tab is hidden and opens a fresh one when it is shown again', async () => {
    const signals: AbortSignal[] = [];
    const request = vi.fn((_path: string, init: RequestInit, read: (response: Response) => Promise<unknown>) => {
      signals.push(init.signal!);
      return read(eventStream(init.signal).response);
    });
    const stop = watchChanges(request);

    await act(async () => showTab('hidden'));
    expect(signals[0]!.aborted).toBe(true);
    await wait(60_000);
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => showTab('visible'));
    expect(request).toHaveBeenCalledTimes(2);
    expect(signals[1]!.aborted).toBe(false);

    stop();
    expect(signals[1]!.aborted).toBe(true);
  });
});

describe('Live resources', () => {
  let container: HTMLDivElement;
  let root: Root;
  let unread: number;
  let pending: ((response: Response) => void) | undefined;
  let stream: ReturnType<typeof eventStream>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const shown: string[] = [];
  let auth: ReturnType<typeof useAuth>;

  function Unread() {
    auth = useAuth();
    const { request } = auth;
    const signedIn = Boolean(auth.user);
    useEffect(() => (signedIn ? watchChanges(request) : undefined), [request, signedIn]);
    const inbox = useResource<{ unread: number }>('/me/inbox/summary', true, { live: ['inbox'] });
    const text = inbox.data ? `${inbox.data.unread} unread` : 'loading';
    shown.push(text);
    return <p>{text}</p>;
  }

  const summaries = () => fetchMock.mock.calls.filter(([path]) => path === '/api/v1/me/inbox/summary').length;

  beforeEach(async () => {
    unread = 0;
    pending = undefined;
    shown.length = 0;
    fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/me/changes') {
        stream = eventStream(init?.signal);
        return Promise.resolve(stream.response);
      }
      if (path === '/me/inbox/summary') {
        unread += 1;
        const response = json({ unread });
        return pending ? new Promise<Response>((resolve) => (pending = resolve)) : Promise.resolve(response);
      }
      if (path === '/me/inbox/read') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(json({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AuthProvider>
            <Unread />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await wait(0);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('reloads once for a burst of matching nudges, ignores other topics, and keeps showing the data meanwhile', async () => {
    expect(container.textContent).toBe('1 unread');

    await act(async () => stream.push('data: {"spaceId":"space-1","topic":"tasks"}\n\n'));
    await wait(300);
    expect(summaries()).toBe(1);

    await act(async () => stream.push('data: {"topic":"inbox"}\n\ndata: {"topic":"inbox"}\n\ndata: {"topic":"inbox"}\n\n'));
    await wait(299);
    expect(summaries()).toBe(1);
    await wait(1);
    expect(summaries()).toBe(2);
    expect(container.textContent).toBe('2 unread');
    expect(shown.slice(shown.indexOf('1 unread'))).not.toContain('loading');
  });

  it('reloads after a change saved in this tab or another one, and when the tab is shown again', async () => {
    await act(async () => void (await auth.request('/me/inbox/summary')));
    await wait(300);
    expect(summaries()).toBe(2);
    expect(container.textContent).toBe('1 unread');

    await act(async () => void (await auth.request('/me/inbox/read', { method: 'POST' })));
    await wait(300);
    expect(container.textContent).toBe('3 unread');

    const otherTab = new BroadcastChannel('strata-changes');
    otherTab.postMessage('changed');
    otherTab.close();
    await vi.waitFor(async () => {
      await wait(300);
      expect(container.textContent).toBe('4 unread');
    });

    await act(async () => showTab('hidden'));
    await act(async () => showTab('visible'));
    await wait(300);
    expect(container.textContent).toBe('5 unread');
    expect(shown.slice(shown.indexOf('1 unread'))).not.toContain('loading');
  });

  it('skips a reload while the previous one is still loading', async () => {
    pending = () => undefined;
    await act(async () => stream.push('data: {"topic":"inbox"}\n\n'));
    await wait(300);
    expect(summaries()).toBe(2);

    await act(async () => stream.push('data: {"topic":"inbox"}\n\n'));
    await wait(300);
    expect(summaries()).toBe(2);

    await act(async () => pending!(json({ unread: 2 })));
    expect(container.textContent).toBe('2 unread');
  });
});

describe('Home widgets', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows a new notification in the inbox widget after a nudge, without going back to a skeleton', async () => {
    const home = { id: 'home', name: 'Home', position: 0, layout: { widgets: [{ id: 'inbox', type: 'inbox', size: 'medium', settings: {} }] }, showFrom: null, showUntil: null, showOn: 'any' };
    const notification = { id: 'n1', kind: 'mention', title: 'Sara mentioned you', body: null, link: null, read: false, createdAt: new Date().toISOString() };
    let stream!: ReturnType<typeof eventStream>;
    let notifications: unknown[] = [];
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/me/changes') {
          stream = eventStream(init?.signal);
          return Promise.resolve(stream.response);
        }
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/dashboards') return Promise.resolve(json([home]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: notifications.length }));
        if (path === '/me/inbox?page=1') {
          const page = json({ page: 1, totalPages: 1, totalResults: notifications.length, results: notifications });
          return release ? new Promise<Response>((resolve) => (release = () => resolve(page))) : Promise.resolve(page);
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await wait(0);
    expect(container.textContent).toContain('You are all caught up.');

    notifications = [notification];
    release = () => undefined;
    await act(async () => stream.push('data: {"topic":"inbox"}\n\n'));
    await wait(300);
    expect(container.textContent).toContain('You are all caught up.');
    expect(container.querySelector('[aria-label="Loading your inbox"]')).toBeNull();

    await act(async () => release!());
    expect(container.textContent).toContain('Sara mentioned you');
    expect(container.querySelector('a[aria-label="Inbox, 1 unread"]')).not.toBeNull();
  });
});
