import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Admin', () => {
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

  async function render(role: string) {
    const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role, timeZone: 'Etc/UTC', features: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/site') return Promise.resolve(json({ inviteOnly: false, fileQuotaMb: 150 }));
        if (path === '/admin/users')
          return Promise.resolve(
            json([
              { id: 'me', displayName: 'Amr', email: 'amr@example.com', handle: 'amr', role: 'admin', verified: true, isActive: true, createdAt: '2026-01-01T00:00:00Z', usedBytes: 0 },
              { id: 'sara', displayName: 'Sara', email: 'sara@example.com', handle: 'sara', role: 'member', verified: false, isActive: true, createdAt: '2026-02-01T00:00:00Z', usedBytes: 3 * 1024 * 1024 },
            ]),
          );
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  }

  it('shows site settings and every account to admins', async () => {
    await render('admin');
    const main = container.querySelector('main')!;
    expect(main.querySelector('h1')?.textContent).toBe('Admin');
    expect([...main.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual(['Site settings', 'People']);
    expect(main.textContent).toContain('2 accounts');
    const rows = [...main.querySelectorAll('li')].map((row) => row.textContent);
    expect(rows[0]).toContain('Amr · Admin');
    expect(rows[1]).toContain('sara@example.com · @sara');
    expect(rows[1]).toContain('3 MB stored · not verified');
  });

  it('is not found for members', async () => {
    await render('member');
    expect(container.textContent).toContain('Page not found');
  });
});
