import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Form validation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
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

  it('checks sign-in fields itself instead of relying on browser prompts', async () => {
    await render('/login');
    const form = container.querySelector<HTMLFormElement>('form')!;

    expect(form.noValidate).toBe(true);
    expect(form.querySelector('[required], [minlength], [pattern]')).toBeNull();
    await submit(form);

    expect([...container.querySelectorAll('.field-error')].map((error) => error.textContent)).toEqual([
      'Enter your email address.',
      'Enter your password.',
    ]);
    expect(form.querySelector('input[name="email"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/auth/login', expect.anything());
  });

  it('explains weak registration details before sending anything', async () => {
    await render('/register');
    const form = container.querySelector<HTMLFormElement>('form')!;
    const fill = (name: string, value: string) => {
      form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = value;
    };
    fill('displayName', 'Reader');
    fill('handle', 'no spaces');
    fill('email', 'reader@example');
    fill('password', 'short');
    await submit(form);

    expect([...container.querySelectorAll('.field-error')].map((error) => error.textContent)).toEqual([
      'Use letters, numbers, - and _, starting and ending with a letter or number.',
      'Enter an email address like name@example.com.',
      'Use at least 12 characters.',
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/auth/register', expect.anything());
  });
});
