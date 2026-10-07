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
const mine = { id: 'mine', name: 'Personal', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };

describe('API and webhooks settings', () => {
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
      if (path === '/spaces') return Promise.resolve(json([mine]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      return Promise.resolve(route(path, init) ?? new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

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
    await act(async () => {});
  }

  it('lists the endpoints each scope opens, and creates a webhook whose secret is shown once', async () => {
    const reference = {
      basePath: '/api/v1',
      scopes: [
        { scope: 'spaces:read', routes: [{ method: 'GET', path: '/spaces' }] },
        { scope: 'items:read', routes: [{ method: 'GET', path: '/agenda' }] },
        { scope: 'items:write', routes: [{ method: 'POST', path: '/spaces/:spaceId/tasks' }] },
      ],
    };
    const webhook = { id: 'hook', spaceId: null, host: 'hooks.example', events: ['task.completed'], active: true, createdAt: '2026-10-07T10:00:00Z', lastDelivery: null };
    const sent: unknown[] = [];
    serve((path, init) => {
      if (path === '/me/api-reference') return json(reference);
      if (path === '/me/webhooks' && init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)));
        return json({ ...webhook, secret: 'whsec_shown_once' }, 201);
      }
      if (path === '/me/webhooks') return json([]);
      if (path === '/me/webhooks/hook/ping') return json({ status: 204, error: null });
      return undefined;
    });
    await render('/settings/api');

    expect(container.textContent).toContain('/api/v1');
    expect([...container.querySelectorAll('summary')].map((summary) => summary.textContent)).toEqual([
      'spaces:read · 1 endpoints',
      'items:read · 1 endpoints',
      'items:write · 1 endpoints',
    ]);

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'New webhook')!.click());
    const dialog = document.querySelector('dialog')!;
    dialog.querySelector<HTMLInputElement>('input[name="url"]')!.value = 'https://hooks.example/in';
    dialog.querySelector<HTMLInputElement>('input[value="task.completed"]')!.checked = true;
    await act(async () => {
      dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(sent).toEqual([{ url: 'https://hooks.example/in', events: ['item.created', 'task.completed'] }]);
    expect(document.querySelector('dialog')?.textContent).toContain('whsec_shown_once');
    await act(async () => [...document.querySelectorAll('dialog button')].find((button) => button.textContent === 'Done')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(document.body.textContent).not.toContain('whsec_shown_once');
    expect(container.textContent).toContain('All spaces · task.completed · nothing sent yet');
  });
});
