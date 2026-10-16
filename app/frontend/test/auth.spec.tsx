import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider, useAuth } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const rateLimited = () => json({ statusCode: 429, message: 'Too many requests. Try again later.' }, 429, { 'Retry-After': '3' });

function SessionProbe() {
  const auth = useAuth();
  if (auth.restoreError) return <p>failed: {auth.restoreError}</p>;
  if (!auth.ready) return <p>loading</p>;
  return <p>{auth.user ? `signed in as ${auth.user.displayName}` : 'signed out'}</p>;
}

describe('Session restore', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function serve(refresh: () => Promise<Response>) {
    const fetchMock = vi.fn((input: string) =>
      input === '/api/v1/auth/refresh' ? refresh() : Promise.resolve(new Response(null, { status: 404 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    return () => fetchMock.mock.calls.filter(([input]) => input === '/api/v1/auth/refresh').length;
  }

  async function render(children: ReactNode) {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>,
      ),
    );
  }

  const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it('waits as long as the server asks after a rate-limited refresh, then restores the session', async () => {
    const refresh = vi.fn().mockResolvedValueOnce(rateLimited()).mockResolvedValue(json({ accessToken: 'token', user }));
    const refreshes = serve(refresh);

    await render(<SessionProbe />);
    expect(container.textContent).toBe('loading');

    await wait(2_999);
    expect(refreshes()).toBe(1);
    expect(container.textContent).toBe('loading');

    await wait(1);
    expect(refreshes()).toBe(2);
    expect(container.textContent).toBe('signed in as Amr');
  });

  it('shows why the session could not be restored instead of the signed-out landing when the retry is limited too', async () => {
    const refreshes = serve(() => Promise.resolve(rateLimited()));

    await render(<App />);
    expect(container.textContent).not.toContain('Create account');

    await wait(3_000);
    await wait(60_000);

    expect(refreshes()).toBe(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your session could not be restored');
    expect(container.textContent).toContain('Too many requests. Try again later.');
    expect(container.textContent).not.toContain('Create account');
    expect(container.textContent).not.toContain('Sign in');
  });

  it('says so straight away instead of waiting out a long rate limit', async () => {
    const refreshes = serve(() => Promise.resolve(json({ statusCode: 429, message: 'Too many requests. Try again later.' }, 429, { 'Retry-After': '600' })));

    await render(<SessionProbe />);

    expect(refreshes()).toBe(1);
    expect(container.textContent).toBe('failed: Too many requests. Try again later.');
  });

  it('backs off between refreshes the server cannot answer and never signs the visitor out', async () => {
    const refreshes = serve(() => Promise.reject(new TypeError('Failed to fetch')));

    await render(<SessionProbe />);
    const calls = [refreshes()];
    for (const delay of [1_000, 2_000, 4_000, 8_000, 60_000]) {
      await wait(delay);
      calls.push(refreshes());
    }

    expect(calls).toEqual([1, 2, 3, 4, 5, 5]);
    expect(container.textContent).toBe('failed: Strata cannot be reached right now');
  });
});
