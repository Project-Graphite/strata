import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('App routes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(path: string) {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
  }

  it('shows the not-found page for an unknown address instead of redirecting home', async () => {
    await render('/nowhere/at/all');

    expect(container.textContent).toContain('Page not found');
    expect(
      [...container.querySelectorAll('a')].find((link) => link.textContent === 'Go home'),
    ).toHaveProperty('pathname', '/');
  });

  it('announces a loading placeholder instead of shifting text while the session restores', async () => {
    let restore: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>((resolve) => (restore = resolve))),
    );

    await render('/login');

    const placeholder = container.querySelector('[role="status"][aria-busy="true"]');
    expect(placeholder?.getAttribute('aria-label')).toBe('Loading your session');
    expect(container.textContent).not.toContain('Loading your session…');
    await act(async () => restore(new Response(null, { status: 401 })));
  });

  it('reaches every area on a phone through the More tab', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([{ id: 'club', name: 'Club', color: 'teal', kind: 'shared', role: 'owner', createdAt: '2026-10-01T00:00:00Z' }]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 3 }));
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    await render('/recurring');
    const more = container.querySelector('nav[aria-label="Main"] a[href="/menu"]')!;
    expect(more.textContent).toBe('More');
    expect(more.getAttribute('aria-current')).toBe('page');

    await act(async () => more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const main = container.querySelector('main')!;
    expect(main.querySelector('h1')?.textContent).toBe('Menu');
    const links = [...main.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/recurring', '/tidy', '/spaces/club', '/inbox', '/invitations', '/trash', '/settings']));
    expect(main.querySelector('a[href="/inbox"]')?.textContent).toContain('3');
  });
});
