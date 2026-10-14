import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth';
import { chooseFromMenu } from './controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC', features: [] };
const home = { id: 'home', name: 'Home', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const megabyte = 1024 * 1024;

describe('Storage', () => {
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

  it('shows what is used against the limit, uploads files and moves one to the trash', async () => {
    let storage = {
      quotaBytes: 150 * megabyte,
      usedBytes: 30 * megabyte,
      trashedBytes: 5 * megabyte,
      files: [{ id: 'f1', spaceId: 'home', name: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: 2 * megabyte, createdAt: '2026-10-10T09:00:00Z' }],
    };
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([home]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
      if (path === '/me/dashboards') return Promise.resolve(json([]));
      if (path === '/me/storage') return Promise.resolve(json(storage));
      if (path === '/spaces/home/files' && init?.method === 'POST') {
        storage = { ...storage, usedBytes: 31 * megabyte };
        return Promise.resolve(json({ id: 'f2' }, 201));
      }
      if (path === '/items/f1/trash' && init?.method === 'POST') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/storage']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});

    expect(container.textContent).toContain('30.0 MB of 150.0 MB used');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('20');
    expect(container.textContent).toContain('5.0 MB is in the trash');
    expect(container.textContent).toContain('contract.pdf');
    expect(container.textContent).toContain('2.0 MB · Oct 10, 2026 · Home');

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Files to upload"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] });
    await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/files', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-File-Name': 'notes.txt' }) }));
    expect(container.textContent).toContain('31.0 MB of 150.0 MB used');

    await chooseFromMenu(container, 'Actions for contract.pdf', 'Move to trash');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/f1/trash', expect.objectContaining({ method: 'POST' }));
  });
});
