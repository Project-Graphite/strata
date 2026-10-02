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
const space = { id: 'home', name: 'Home', color: 'green', kind: 'shared', role: 'editor', createdAt: '2026-10-01T00:00:00Z' };
const at = '2026-10-02T00:00:00Z';
const notes = {
  id: 'notes',
  spaceId: 'home',
  kind: 'file',
  title: 'notes.txt',
  tags: [],
  file: { mimeType: 'text/plain', sizeBytes: 2048, width: null, height: null },
  archivedAt: null,
  trashedAt: null,
  createdAt: at,
  updatedAt: at,
};

describe('Files', () => {
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
    vi.restoreAllMocks();
  });

  function serve(uploaded: () => boolean, route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([space]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/spaces/home/items?page=1') {
        const results = uploaded() ? [notes] : [];
        return Promise.resolve(json({ page: 1, totalPages: 1, totalResults: results.length, results }));
      }
      return Promise.resolve(route(path, init) ?? new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function render() {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/spaces/home']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
  }

  async function choose(...files: File[]) {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('uploads chosen files as the request body with their name, and skips files over 25 MB', async () => {
    let uploaded = false;
    const fetchMock = serve(
      () => uploaded,
      (path, init) => {
        if (path === '/spaces/home/files' && init?.method === 'POST') {
          uploaded = true;
          return json(notes, 201);
        }
        return undefined;
      },
    );
    await render();
    const huge = new File(['x'], 'film.mov', { type: 'video/quicktime' });
    Object.defineProperty(huge, 'size', { value: 26 * 1024 * 1024 });

    await choose(new File(['remember the milk'], 'notes.txt', { type: 'text/plain' }), huge);

    const [, init] = fetchMock.mock.calls.find(([path]) => path === '/api/v1/spaces/home/files')!;
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/octet-stream', 'X-File-Name': 'notes.txt' });
    expect(init?.body).toBeInstanceOf(Blob);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/spaces/home/files')).toHaveLength(1);
    expect(container.textContent).toContain('Added notes.txt. film.mov is over 25 MB.');
    expect(container.textContent).toContain('file · 2 KB · updated');
  });

  it('downloads a file through the signed-in request', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:notes');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const fetchMock = serve(
      () => true,
      (path) => (path === '/files/notes' ? new Response('remember the milk', { headers: { 'Content-Type': 'text/plain' } }) : undefined),
    );
    await render();

    const download = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Download')!;
    await act(async () => download.click());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/files/notes',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
  });
});
