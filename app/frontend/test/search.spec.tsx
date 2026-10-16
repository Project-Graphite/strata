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
const flat = { id: 'flat', name: 'Flat', color: 'teal', kind: 'shared', role: 'viewer', createdAt: '2026-10-01T00:00:00Z' };

describe('Search palette', () => {
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

  it('opens with Ctrl+K and lists matching items, tags, spaces and pages', async () => {
    const fetchMock = vi.fn((input: string) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([flat]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/search?q=fla') {
        return Promise.resolve(
          json({
            items: [
              { id: 'rota', spaceId: 'flat', spaceName: 'Flat', kind: 'note', quick: false, title: 'Flat rota', archived: false },
              { id: 'chores', spaceId: 'flat', spaceName: 'Flat', kind: 'note', quick: true, title: 'Flat chores', archived: false },
            ],
            tags: [{ id: 'bills', spaceId: 'flat', name: 'Flat bills', color: 'blue' }],
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    expect(input).not.toBeNull();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(input, 'fla');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/search?q=fla', expect.anything());
    const options = [...container.querySelectorAll('[role="option"]')].map((option) => option.textContent);
    expect(options).toEqual(['Flat rotapage · Flat', 'Flat choresquick note · Flat', 'Flat billsFlat', 'Flat']);
    expect(container.querySelector<HTMLAnchorElement>('[role="option"]')?.getAttribute('href')).toBe('/notes/rota');
  });

  it('creates a page in the personal space from the palette', async () => {
    const home = { ...flat, id: 'home', name: 'Home', kind: 'personal', role: 'owner' };
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([home, flat]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/spaces/home/notes' && init?.method === 'POST') return Promise.resolve(json({ id: 'fresh' }, 201));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const labels = [...container.querySelectorAll('[role="option"]')].map((option) => option.textContent);
    expect(labels).toEqual(expect.arrayContaining(['New page', 'Tasks']));
    expect(labels).not.toContain('Go to tasks');
    const task = [...container.querySelectorAll<HTMLAnchorElement>('[role="option"]')].find((option) => option.textContent === 'Tasks')!;
    expect(task.getAttribute('href')).toBe('/tasks');

    await act(async () =>
      [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'New page')!.click(),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/notes', expect.objectContaining({ method: 'POST', body: '{}' }));
  });

  it('says so when a search or a new page fails instead of looking empty', async () => {
    const home = { ...flat, id: 'home', name: 'Home', kind: 'personal', role: 'owner' };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([home]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/search?q=zzz') return Promise.resolve(json({ statusCode: 429, message: 'Too many searches. Wait a minute.' }, 429));
        if (path === '/spaces/home/notes') return Promise.resolve(json({ statusCode: 403, message: 'You can only view this space.' }, 403));
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });

    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'zzz');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(container.textContent).toContain('Too many searches. Wait a minute.');

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'New page')!.click(),
    );
    await vi.waitFor(() => expect(document.body.textContent).toContain('You can only view this space.'));
  });
});
