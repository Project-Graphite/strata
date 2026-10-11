import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const spaces = [
  { id: 'looking', name: 'Looking only', color: 'gray', kind: 'shared', role: 'viewer', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'club', name: 'Club', color: 'teal', kind: 'shared', role: 'owner', createdAt: '2026-10-01T00:00:00Z' },
];

function fakeCaches(entries: Record<string, Response> | null) {
  let present = entries !== null;
  const cache = {
    match: (path: string) => Promise.resolve(entries?.[path]?.clone()),
    keys: () => Promise.resolve(Object.keys(entries ?? {}).map((path) => new Request(`http://localhost${path}`))),
  };
  return {
    has: vi.fn(() => Promise.resolve(present)),
    open: vi.fn(() => Promise.resolve(cache)),
    delete: vi.fn(() => {
      present = false;
      return Promise.resolve(true);
    }),
  };
}

describe('Save to Strata', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function serve(route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json(spaces));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      return Promise.resolve(route(path, init) ?? new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function render() {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/save']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
  }

  it('turns a shared link into a task and uploads the shared file to a space you can edit', async () => {
    const shared = fakeCaches({
      '/share-target/text': json({ title: 'Tickets', text: 'Look https://example.com/tickets', url: 'https://example.com/tickets' }),
      '/share-target/files/0': new Response('ticket', { headers: { 'Content-Type': 'text/plain', 'X-File-Name': encodeURIComponent('ticket one.txt') } }),
    });
    vi.stubGlobal('caches', shared);
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/club/tasks' && init?.method === 'POST') return json({ id: 'task' }, 201);
      if (path === '/spaces/club/files' && init?.method === 'POST') return json({ id: 'file' }, 201);
      return undefined;
    });
    await render();

    expect(container.querySelector('h1')?.textContent).toBe('Save what you shared');
    expect([...container.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Club']);
    expect(container.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Tickets — Look https://example.com/tickets');
    expect(container.textContent).toContain('ticket one.txt');

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/spaces/club/tasks',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Tickets — Look https://example.com/tickets' }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/spaces/club/files',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-File-Name': 'ticket%20one.txt' }) }),
    );
    expect(shared.delete).toHaveBeenCalledWith('strata-share');
  });

  it('saves a shared link as a bookmark to read later, or as a task when chosen', async () => {
    const shared = fakeCaches({ '/share-target/text': json({ title: 'Slow bread', text: 'Worth a read https://bread.example/slow', url: '' }) });
    vi.stubGlobal('caches', shared);
    const bookmark = { id: 'b1', spaceId: 'club', title: 'bread.example', url: 'https://bread.example/slow', siteName: null, description: null, readAt: null, createdAt: '2026-10-11T08:00:00Z', updatedAt: '2026-10-11T08:00:00Z', article: null };
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/club/bookmarks' && init?.method === 'POST') return json({ bookmark, html: null, fetchError: 'That address took too long to answer' }, 201);
      if (path === '/me/bookmarks?status=unread') return json([bookmark]);
      return undefined;
    });
    await render();

    expect(container.textContent).toContain('https://bread.example/slow');
    expect(container.querySelector('input[name="title"]')).toBeNull();
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[name="saveAs"]')[1]!.click());
    expect(container.querySelector('input[name="title"]')).not.toBeNull();
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[name="saveAs"]')[0]!.click());

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/spaces/club/bookmarks',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://bread.example/slow' }) }),
    );
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/tasks'))).toBe(false);
    expect(shared.delete).toHaveBeenCalledWith('strata-share');
    await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Bookmarks'));
  });

  it('asks for a task title when only text was shared, and can discard it', async () => {
    const shared = fakeCaches({ '/share-target/text': json({ title: '', text: '', url: '' }) });
    vi.stubGlobal('caches', shared);
    const fetchMock = serve(() => undefined);
    await render();

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Enter a title for the task.');
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/tasks'))).toBe(false);

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Discard')!.click());
    expect(shared.delete).toHaveBeenCalledWith('strata-share');
    expect(container.textContent).toContain('Nothing to save');
  });
});
