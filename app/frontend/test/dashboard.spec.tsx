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
const widgets = [
  { id: 'clock', type: 'clock', size: 'small', settings: {} },
  { id: 'links', type: 'shortcuts', size: 'wide', settings: { links: [{ label: 'Mail', url: 'https://mail.example.com' }] } },
  { id: 'inbox', type: 'inbox', size: 'medium', settings: {} },
];
const home = { id: 'home', name: 'Home', position: 0, layout: { widgets } };

describe('Home dashboard', () => {
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

  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label || candidate.getAttribute('aria-label') === label)!;
  const titles = () => [...container.querySelectorAll('article h2')].map((title) => title.textContent);

  it('shows each widget on its own, and saves a rearranged layout only when done', async () => {
    let saved: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([]));
        if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
        if (path === '/me/dashboards') return Promise.resolve(json([home]));
        if (path === '/me/inbox?page=1') return Promise.resolve(json({ message: 'The inbox is unavailable' }, 400));
        if (path === '/me/dashboards/home' && init?.method === 'PATCH') {
          saved = JSON.parse(String(init.body));
          return Promise.resolve(json({ ...home, name: 'Mornings', layout: (saved as { layout: unknown }).layout }));
        }
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

    expect(titles()).toEqual(['Clock', 'Shortcuts', 'Inbox']);
    expect(container.querySelector('a[href="https://mail.example.com"]')?.textContent).toContain('Mail');
    expect(container.textContent).toContain('The inbox is unavailable');
    expect(container.querySelector('button[aria-label="Move Clock later"]')).toBeNull();

    await act(async () => button('Edit dashboard').click());
    await act(async () => button('Move Clock later').click());
    expect(titles()).toEqual(['Shortcuts', 'Clock', 'Inbox']);
    await act(async () => button('Undo').click());
    expect(titles()).toEqual(['Clock', 'Shortcuts', 'Inbox']);
    const removeInbox = [...container.querySelectorAll('article')].find((article) => article.getAttribute('aria-label') === 'Inbox')!;
    await act(async () => [...removeInbox.querySelectorAll('button')].find((candidate) => candidate.textContent === 'remove')!.click());
    expect(saved).toBeUndefined();

    await act(async () => button('Done').click());
    expect(saved).toEqual({ layout: { widgets: widgets.slice(0, 2) }, name: 'Home' });
    expect(titles()).toEqual(['Clock', 'Shortcuts']);
  });
});
