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
const choir = { id: 'choir', name: 'Choir', color: 'teal', kind: 'shared', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const page = <T,>(results: T[]) => ({ page: 1, totalPages: 1, totalResults: results.length, results });
const at = '2026-10-02T00:00:00Z';

type Route = (path: string, init?: RequestInit) => Response | undefined;

describe('Activity, inbox and security log', () => {
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

  function serve(route: Route) {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const path = input.replace('/api/v1', '');
        if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
        if (path === '/spaces') return Promise.resolve(json([choir]));
        return Promise.resolve(route(path, init) ?? new Response(null, { status: 404 }));
      }),
    );
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
  }

  it('counts unread notifications on the bell and clears it when they are read', async () => {
    let unread = 1;
    serve((path, init) => {
      if (path === '/me/inbox/summary') return json({ unread });
      if (path === '/me/inbox?page=1') {
        return json(
          page([
            {
              id: 'n1',
              kind: 'member_joined',
              title: 'Sara joined Choir',
              body: null,
              link: '/spaces/choir/members',
              read: unread === 0,
              createdAt: at,
            },
          ]),
        );
      }
      if (path === '/me/inbox/read' && init?.method === 'POST') {
        unread = 0;
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    await render('/inbox');

    expect(container.querySelector('a[aria-label="Inbox, 1 unread"]')).not.toBeNull();
    expect(container.textContent).toContain('Sara joined Choir');
    const markAll = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Mark all read')!;
    await act(async () => markAll.click());

    expect(container.textContent).toContain('Everything is marked read.');
    expect(container.querySelector('a[aria-label="Inbox"]')).not.toBeNull();
  });

  it('describes what happened in a space', async () => {
    serve((path) => {
      if (path === '/me/inbox/summary') return json({ unread: 0 });
      if (path === '/spaces/choir/activity?page=1') {
        return json(
          page([
            {
              id: 'a3',
              verb: 'member.role_changed',
              actor: { handle: 'amr', displayName: 'Amr' },
              item: null,
              data: { member: 'Sara', role: 'viewer' },
              createdAt: at,
            },
            {
              id: 'a2',
              verb: 'item.updated',
              actor: { handle: 'sara', displayName: 'Sara' },
              item: { id: 'i', kind: 'note', title: 'Set list' },
              data: { title: 'Set list', renamedFrom: 'Songs' },
              createdAt: at,
            },
            {
              id: 'a1',
              verb: 'member.joined',
              actor: { handle: 'sara', displayName: 'Sara' },
              item: null,
              data: { member: 'Sara', role: 'editor' },
              createdAt: at,
            },
          ]),
        );
      }
      return undefined;
    });
    await render('/spaces/choir/activity');

    const lines = [...container.querySelectorAll('ol li')].map((line) => line.firstElementChild?.textContent);
    expect(lines).toEqual(['Amr made Sara a viewer', 'Sara renamed “Songs” to “Set list”', 'Sara joined as an editor']);
  });

  it('lists failed sign-ins in the security log with the device', async () => {
    serve((path) => {
      if (path === '/me/inbox/summary') return json({ unread: 0 });
      if (path === '/me/sessions') {
        return json([{ id: 's', deviceLabel: 'Firefox on Windows', signedInAt: at, lastUsedAt: at, current: true }]);
      }
      if (path === '/me/audit?page=1') {
        return json(
          page([
            { id: 'e2', action: 'sign_in_failed', data: { reason: 'password', device: 'Safari on iOS' }, createdAt: at },
            { id: 'e1', action: 'two_step_enabled', data: {}, createdAt: at },
          ]),
        );
      }
      return undefined;
    });
    await render('/settings/sessions');

    expect(container.textContent).toContain('Failed sign-in · wrong password · Safari on iOS');
    expect(container.textContent).toContain('Two-step sign-in turned on');
  });
});
