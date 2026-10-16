import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const code = 'c'.repeat(43);

describe('Signed-out pages', () => {
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

  function serve(routes: Record<string, () => Response>) {
    const fetchMock = vi.fn((input: string) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(new Response(null, { status: 401 }));
      return Promise.resolve(routes[path]?.() ?? new Response(null, { status: 404 }));
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

  const alert = () => container.querySelector('[role="alert"]')?.textContent;

  it('shows a failed sign-in next to the form, where the keyboard cannot hide it', async () => {
    serve({ '/auth/login': () => json({ statusCode: 401, message: 'Wrong email or password.' }, 401) });
    await render('/login');

    const form = container.querySelector('form')!;
    form.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'amr@example.com';
    form.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'not the password';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const shown = form.querySelector('[role="alert"]')!;
    expect(shown.textContent).toBe('Wrong email or password.');
    expect(shown.nextElementSibling?.textContent).toContain('Sign in');
  });

  it('explains a reset link without its token before asking for a password', async () => {
    serve({});
    await render('/reset-password');

    expect(container.querySelector('h1')?.textContent).toBe('This link is incomplete');
    expect(container.querySelector('input[name="password"]')).toBeNull();
    expect(container.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });

  it('verifies the email as soon as the link opens', async () => {
    const fetchMock = serve({ '/auth/verify-email': () => new Response(null, { status: 204 }) });
    await render('/verify?token=abc123');

    await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Your email address is confirmed.'));
    expect(fetchMock.mock.calls.filter(([input]) => input.endsWith('/auth/verify-email'))).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/verify-email', expect.objectContaining({ body: JSON.stringify({ token: 'abc123' }) }));
    expect(container.querySelector('input')).toBeNull();
  });

  it('says why a verification link did not work', async () => {
    serve({ '/auth/verify-email': () => json({ statusCode: 401, message: 'This link has expired or was already used.' }, 401) });
    await render('/verify?token=used');

    await vi.waitFor(() => expect(alert()).toBe('This link has expired or was already used.'));
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('offers to try an invitation again when it failed to load, and calls it closed only when it is gone', async () => {
    serve({ [`/rsvp/${code}`]: () => json({ statusCode: 429, message: 'Too many attempts. Wait a minute, then try again.' }, 429) });
    await render(`/rsvp/${code}`);

    await vi.waitFor(() => expect(alert()).toContain('Too many attempts'));
    expect(container.querySelector('h1')?.textContent).toBe('Your invitation');
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Try again')).toBe(true);
    expect(container.textContent).not.toContain('no longer open');

    act(() => root.unmount());
    root = createRoot(container);
    serve({});
    await render(`/rsvp/${code}`);
    await vi.waitFor(() => expect(container.textContent).toContain('This invitation is no longer open'));
  });
});
