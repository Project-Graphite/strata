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

describe('Profile settings', () => {
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

  it('turns the weekly Tidy summary on', async () => {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/me/two-step') return Promise.resolve(json({ enabled: false, recoveryCodesLeft: 0 }));
      if (path === '/me' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ tidySummary: true });
        return Promise.resolve(json({ ...user, tidySummary: true }));
      }
      if (path === '/me') return Promise.resolve(json({ ...user, tidySummary: false }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/settings']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    const toggle = container.querySelector<HTMLButtonElement>('button[role="switch"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await act(async () => toggle.click());

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me', expect.objectContaining({ method: 'PATCH' }));
    expect(container.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('You will get a Tidy summary on Mondays.');
  });

  async function settings(path: string, route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const requested = input.replace('/api/v1', '');
      if (requested === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (requested === '/spaces') return Promise.resolve(json([]));
      if (requested === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (requested === '/me' && !init?.method) return Promise.resolve(json({ ...user, tidySummary: false }));
      return Promise.resolve(route(requested, init) ?? new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    return fetchMock;
  }

  const button = (label: string) => [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label)!;
  const fill = (form: Element, values: Record<string, string>) => {
    for (const [name, value] of Object.entries(values)) form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
  };
  const submit = (form: Element) =>
    act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

  it('keeps the email change behind a button and closes the modal once the link is sent', async () => {
    const fetchMock = await settings('/settings', (path, init) => {
      if (path === '/me/two-step') return json({ enabled: true, recoveryCodesLeft: 9 });
      if (path === '/me/email' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ email: 'new@example.com', password: 'secret words', code: '123456' });
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    expect(container.textContent).toContain('amr@example.com');
    expect(container.querySelector('input[name="email"]')).toBeNull();
    await act(async () => button('Change').click());
    const form = container.querySelector('dialog form')!;
    await submit(form);
    expect(form.textContent).toContain('Enter the new email address.');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/me/email', expect.anything());

    fill(form, { email: 'new@example.com', password: 'secret words', code: '123456' });
    await submit(form);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/email', expect.objectContaining({ method: 'POST' }));
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector('.snackbar')?.textContent).toContain('Check the new inbox for a confirmation link.');
  });

  it('opens password and two-step changes in modals and shows failures as a toast', async () => {
    const fetchMock = await settings('/settings/security', (path, init) => {
      if (path === '/me/two-step' && init?.method === 'DELETE') return json({ message: 'That code is not right' }, 400);
      if (path === '/me/two-step') return json({ enabled: true, recoveryCodesLeft: 8 });
      return undefined;
    });

    expect(container.textContent).toContain('On · 8 of 10 recovery codes left');
    expect(container.querySelector('input[type="password"]')).toBeNull();
    await act(async () => button('Change').click());
    expect(container.querySelector('dialog h2')?.textContent).toBe('Change password');
    await act(async () => button('Cancel').click());
    expect(container.querySelector('dialog')).toBeNull();

    await act(async () => button('Turn off').click());
    const form = container.querySelector('dialog form')!;
    fill(form, { password: 'secret words', code: '000000' });
    await submit(form);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/two-step', expect.objectContaining({ method: 'DELETE' }));
    expect(container.querySelector('dialog')).not.toBeNull();
    const toast = container.querySelector('.snackbar-error');
    expect(toast?.getAttribute('role')).toBe('alert');
    expect(toast?.textContent).toContain('That code is not right');
  });

  it('offers a retry when a settings page fails to load', async () => {
    let failing = true;
    await settings('/settings/security', (path) => {
      if (path === '/me/two-step') return failing ? json({ message: 'Database is resting' }, 400) : json({ enabled: false, recoveryCodesLeft: 0 });
      return undefined;
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Database is resting');
    failing = false;
    await act(async () => button('Try again').click());
    expect(container.textContent).toContain('Two-step sign-in');
    expect(button('Turn on')).toBeDefined();
  });
});
