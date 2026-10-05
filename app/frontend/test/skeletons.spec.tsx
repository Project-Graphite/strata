import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmoothImage } from '@project-graphite/ui';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Skeleton loaders', () => {
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

  it('holds the account controls as placeholders until the session is known', async () => {
    let restore: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        String(input).endsWith('/auth/refresh')
          ? new Promise<Response>((resolve) => (restore = resolve))
          : Promise.resolve(new Response(null, { status: 404 })),
      ),
    );

    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/privacy']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );

    const header = container.querySelector('header')!;
    expect(header.textContent).not.toContain('Sign in');
    expect(header.querySelectorAll('.skeleton')).toHaveLength(1);
    expect(container.querySelector('nav[aria-label="Main"]')?.textContent).not.toContain('Sign in');

    await act(async () => restore(new Response(null, { status: 401 })));

    expect(header.textContent).toContain('Sign in');
    expect(header.querySelector('.skeleton')).toBeNull();
  });

  it('shimmers in place of an image until it has loaded', async () => {
    await act(async () => root.render(<SmoothImage alt="Poster" src="https://example.com/poster.jpg" />));

    const image = container.querySelector('img')!;
    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(image.className).toContain('opacity-0');

    await act(async () => image.dispatchEvent(new Event('load')));

    expect(container.querySelector('.skeleton')).toBeNull();
    expect(image.className).toContain('opacity-100');
  });

  it('falls back when an image cannot load instead of shimmering forever', async () => {
    await act(async () =>
      root.render(<SmoothImage alt="Poster" fallback={<span>Tower Story</span>} src="https://example.com/missing.jpg" />),
    );

    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));

    expect(container.querySelector('.skeleton')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('Tower Story');
  });
});
