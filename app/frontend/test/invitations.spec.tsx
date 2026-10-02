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
const personal = { id: 'personal', name: 'Personal', color: 'gray', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const choir = { id: 'choir', name: 'Choir', color: 'teal', kind: 'shared', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const code = 'c'.repeat(43);

type Route = (path: string, init?: RequestInit) => Response | undefined;

describe('Invitations', () => {
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

  function serve(signedIn: boolean, route: Route) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') {
        return Promise.resolve(signedIn ? json({ accessToken: 'token', user }) : new Response(null, { status: 401 }));
      }
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
  }

  async function submit(form: HTMLFormElement) {
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  const fill = (form: HTMLFormElement, name: string, value: string) => {
    form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!.value = value;
  };

  it('signs up with an invite, showing who sent it and the address it was sent to', async () => {
    const fetchMock = serve(false, (path, init) => {
      if (path === `/invitations/lookup/${code}`) {
        return json({ kind: 'space', email: 'new@example.com', space: 'Choir', inviter: 'Sara' });
      }
      if (path === '/site') return json({ inviteOnly: true });
      if (path === '/auth/register') {
        expect(JSON.parse(String(init?.body))).toMatchObject({ email: 'new@example.com', invite: code });
        return json({ registered: true }, 201);
      }
      return undefined;
    });
    await render(`/register?invite=${code}`);

    expect(container.textContent).toContain('Sara invited you to Choir.');
    const form = container.querySelector('form')!;
    expect(form.querySelector<HTMLInputElement>('input[name="email"]')!.value).toBe('new@example.com');
    fill(form, 'displayName', 'New');
    fill(form, 'handle', 'newcomer');
    fill(form, 'password', 'a long enough password');
    await submit(form);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/register', expect.anything());
    expect(container.textContent).toContain('Check your inbox');
  });

  it('closes the sign-up form while Strata is invite-only and no invite was given', async () => {
    serve(false, (path) => (path === '/site' ? json({ inviteOnly: true }) : undefined));
    await render('/register');

    expect(container.textContent).toContain('Sign-up is closed for now');
    expect(container.querySelector('input[name="password"]')).toBeNull();
  });

  it('lets an owner invite by handle and shows the invite as waiting', async () => {
    let invited = false;
    const fetchMock = serve(true, (path, init) => {
      if (path === '/spaces') return json([personal, choir]);
      if (path === '/spaces/choir/members') {
        return json([{ userId: 'me', handle: 'amr', displayName: 'Amr', role: 'owner', joinedAt: '2026-10-01T00:00:00Z' }]);
      }
      if (path === '/spaces/choir/invitations' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ handle: '@sam', role: 'viewer', note: 'Join us' });
        invited = true;
        return json({ invitation: {}, emailed: true }, 201);
      }
      if (path === '/spaces/choir/invitations') {
        return json(
          invited
            ? [
                {
                  id: 'invite',
                  kind: 'space',
                  email: null,
                  invitee: { handle: 'sam', displayName: 'Sam' },
                  role: 'viewer',
                  note: 'Join us',
                  status: 'pending',
                  joined: [],
                  createdAt: '2026-10-02T00:00:00Z',
                  expiresAt: '2026-10-16T00:00:00Z',
                },
              ]
            : [],
        );
      }
      return undefined;
    });
    await render('/spaces/choir/members');

    const form = [...container.querySelectorAll('form')].at(-1)!;
    fill(form, 'who', '@sam');
    form.querySelector<HTMLSelectElement>('select[name="role"]')!.value = 'viewer';
    fill(form, 'note', 'Join us');
    await submit(form);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/choir/invitations', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Invited @sam.');
    expect(container.textContent).toContain('Sam (@sam)');
  });

  it('accepts an invitation and adds the space to the sidebar', async () => {
    let accepted = false;
    serve(true, (path, init) => {
      if (path === '/spaces') return json([personal]);
      if (path === '/me/invitations') {
        return json([
          {
            id: 'invite',
            space: { id: 'choir', name: 'Choir', color: 'teal' },
            role: 'editor',
            inviter: { handle: 'sara', displayName: 'Sara' },
            note: null,
            expiresAt: '2026-10-16T00:00:00Z',
          },
        ]);
      }
      if (path === '/invitations') return json([]);
      if (path === '/invitations/invite/accept' && init?.method === 'POST') {
        accepted = true;
        return json({ spaceId: 'choir' });
      }
      if (path === '/spaces/choir' && accepted) return json({ ...choir, role: 'editor' });
      return undefined;
    });
    await render('/invitations');

    expect(container.textContent).toContain('from Sara · as editor');
    const accept = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Accept')!;
    await act(async () => accept.click());

    expect(container.textContent).toContain('You joined Choir.');
    expect(container.querySelector('nav[aria-label="Areas"]')!.textContent).toContain('Choir');
  });
});
