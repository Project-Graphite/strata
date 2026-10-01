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
});
