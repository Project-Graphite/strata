import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { QrCode } from '../src/components/QrCode';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Two-step sign-in', () => {
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

  it('asks for the authenticator code after the password and signs in with it', async () => {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (input.endsWith('/auth/refresh')) return Promise.resolve(new Response(null, { status: 401 }));
      if (input.endsWith('/auth/login')) return Promise.resolve(json({ twoStep: true, challenge: 'c'.repeat(64) }));
      if (input.endsWith('/auth/two-step')) {
        expect(JSON.parse(String(init?.body))).toEqual({ challenge: 'c'.repeat(64), code: '123456' });
        return Promise.resolve(
          json({
            accessToken: 'token',
            user: { id: 'u', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await render('/login');

    const login = container.querySelector('form')!;
    login.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'amr@example.com';
    login.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'correct horse battery';
    await submit(login);

    expect(container.textContent).toContain('Enter your code');
    const code = container.querySelector<HTMLInputElement>('input[name="code"]')!;
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    code.value = '123456';
    await submit(container.querySelector('form')!);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/two-step', expect.anything());
    expect(container.querySelector('button[aria-label="Account menu for Amr"]')).not.toBeNull();
  });

  it('switches to a recovery code field that accepts letters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        Promise.resolve(
          input.endsWith('/auth/login')
            ? json({ twoStep: true, challenge: 'c'.repeat(64) })
            : new Response(null, { status: 401 }),
        ),
      ),
    );
    await render('/login');
    const login = container.querySelector('form')!;
    login.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'amr@example.com';
    login.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'correct horse battery';
    await submit(login);

    await act(async () =>
      [...container.querySelectorAll('button')].find((button) => button.textContent === 'Use a recovery code instead')!.click(),
    );

    const code = container.querySelector<HTMLInputElement>('input[name="code"]')!;
    expect(code.closest('label')?.textContent).toContain('Recovery code');
    expect(code.getAttribute('inputmode')).toBeNull();
    expect(code.getAttribute('pattern')).toBeNull();
  });

  it('sends a signed-out visitor from settings to sign in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await render('/settings/security');

    expect(container.textContent).toContain('Sign in');
    expect(container.querySelector('input[name="password"]')).not.toBeNull();
  });
});

describe('QrCode', () => {
  it('draws a labelled, square code', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<QrCode label="Scan me" value="otpauth://totp/Strata:amr?secret=ABC" />));

    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg.getAttribute('aria-label')).toBe('Scan me');
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(width).toBe(height);
    expect(width).toBeGreaterThan(20);
    expect(svg.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    act(() => root.unmount());
    container.remove();
  });
});
