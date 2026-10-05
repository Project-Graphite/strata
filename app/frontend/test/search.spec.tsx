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
            items: [{ id: 'rota', spaceId: 'flat', spaceName: 'Flat', kind: 'note', title: 'Flat rota', archived: false }],
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
    expect(options).toEqual(['Flat rotanote · Flat', 'Flat billsFlat', 'Flat']);
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
    expect(labels).toEqual(expect.arrayContaining(['New page', 'New task']));
    const task = [...container.querySelectorAll<HTMLAnchorElement>('[role="option"]')].find((option) => option.textContent === 'New task')!;
    expect(task.getAttribute('href')).toBe('/spaces/home/tasks');

    await act(async () =>
      [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'New page')!.click(),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/notes', expect.objectContaining({ method: 'POST', body: '{}' }));
  });
});
