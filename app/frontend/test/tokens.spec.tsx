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
const secret = `strata_pat_${'s'.repeat(43)}`;

describe('Access tokens', () => {
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

  it('creates a token with the chosen permissions and shows it once', async () => {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/me/two-step') return Promise.resolve(json({ enabled: false, recoveryCodesLeft: 0 }));
      if (path === '/me/tokens' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          name: 'Backup',
          scopes: ['spaces:read', 'items:read'],
          expiresInDays: 90,
          password: 'my password',
        });
        return Promise.resolve(
          json(
            {
              id: 't',
              name: 'Backup',
              scopes: ['spaces:read', 'items:read'],
              lastUsedAt: null,
              expiresAt: '2027-01-01T00:00:00Z',
              createdAt: '2026-10-02T00:00:00Z',
              token: secret,
            },
            201,
          ),
        );
      }
      if (path === '/me/tokens') return Promise.resolve(json([]));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/settings/tokens']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    const form = container.querySelector('form')!;
    form.querySelector<HTMLInputElement>('input[name="name"]')!.value = 'Backup';
    form.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'my password';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/tokens', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('code')?.textContent).toBe(secret);
    expect(container.textContent).toContain('spaces:read, items:read · never used');
  });
});
