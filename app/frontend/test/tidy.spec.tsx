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
const club = { id: 'club', name: 'Club', color: 'teal', kind: 'shared', role: 'owner', createdAt: '2026-10-01T00:00:00Z' };
const finance = { id: 'finance', spaceId: 'club', name: 'Finance', color: 'green' };
const copy = (id: string, createdAt: string) => ({
  id,
  spaceId: 'club',
  title: 'Lease.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 3 * 1024 * 1024,
  archivedAt: null,
  createdAt,
  updatedAt: createdAt,
});
const scan = {
  files: { duplicates: [{ sizeBytes: 3 * 1024 * 1024, savingBytes: 3 * 1024 * 1024, items: [copy('first', '2026-01-01T00:00:00Z'), copy('second', '2026-02-01T00:00:00Z')] }], large: [], old: [] },
  subscriptions: { unused: [], duplicates: [], overlapping: [] },
};
const batch = { id: 'batch', action: 'trash', tag: null, rule: null, itemCount: 1, remaining: 1, createdAt: '2026-10-04T10:00:00Z', undoneAt: null };

const button = (label: string) =>
  [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === label) as HTMLButtonElement;

describe('Tidy', () => {
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

  function serve(route: (path: string, init?: RequestInit) => Response | undefined) {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace('/api/v1', '');
      if (path === '/auth/refresh') return Promise.resolve(json({ accessToken: 'token', user }));
      if (path === '/spaces') return Promise.resolve(json([club]));
      if (path === '/me/inbox/summary') return Promise.resolve(json({ unread: 0 }));
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

  it('selects the extra copies, previews the change, applies it and undoes it', async () => {
    const fetchMock = serve((path, init) => {
      if (path === '/tidy/scan') return json(scan);
      if (path === '/tidy/preview') {
        expect(JSON.parse(String(init?.body))).toEqual({ action: 'trash', itemIds: ['second'] });
        return json({ changes: [{ id: 'second', spaceId: 'club', kind: 'file', title: 'Lease.pdf' }], skipped: [] });
      }
      if (path === '/tidy/apply') return json({ batch, skipped: [] }, 201);
      if (path === '/tidy/history/batch/undo') return json({ restored: 1, skipped: [] });
      return undefined;
    });
    await render('/tidy');

    expect(container.textContent).toContain('3.0 MB');
    expect(container.textContent).toContain('2 copies of 3.0 MB');
    await act(async () => button('Select the extra copies').click());
    expect(container.textContent).toContain('1 item selected');
    await act(async () => button('Move to the trash').click());

    expect(document.querySelector('dialog')?.textContent).toContain('1 item will move to the trash, which keeps items for 30 days');
    await act(async () => [...document.querySelectorAll('dialog button')].find((candidate) => candidate.textContent === 'Move to the trash')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tidy/apply', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Moved 1 item to the trash.');
    await act(async () => button('Undo').click());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tidy/history/batch/undo', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Undone for 1 item.');
  });

  it('lists the undo history with what was left alone', async () => {
    serve((path) => {
      if (path === '/tidy/history') return json([{ ...batch, action: 'tag', tag: finance, rule: { id: 'rule', titleContains: 'receipt' }, itemCount: 2 }]);
      if (path === '/tidy/history/batch/undo') return json({ restored: 1, skipped: [{ id: 'x', title: 'March receipt', reason: 'No longer has this tag' }] });
      return undefined;
    });
    await render('/tidy?view=history');

    expect(container.textContent).toContain('Tagged 2 items Finance');
    expect(container.textContent).toContain('by the rule “receipt”');
    await act(async () => button('Undo').click());
    expect(container.textContent).toContain('Undone for 1 item. Left as they are: March receipt (no longer has this tag).');
  });

  it('adds a tagging rule and tags the existing matches through the preview', async () => {
    const rule = { id: 'rule', spaceId: 'club', titleContains: 'receipt', kind: null, tag: finance, enabled: true, createdAt: '2026-10-04T10:00:00Z' };
    const fetchMock = serve((path, init) => {
      if (path === '/spaces/club') return json(club);
      if (path === '/spaces/club/tags') return json([finance]);
      if (path === '/spaces/club/tidy-rules' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ titleContains: 'receipt', tagId: 'finance' });
        return json(rule, 201);
      }
      if (path === '/spaces/club/tidy-rules') return json([]);
      if (path === '/tidy-rules/rule/matches') return json({ total: 1, results: [{ id: 'old', spaceId: 'club', kind: 'note', title: 'May receipt' }] });
      if (path === '/tidy/preview') return json({ changes: [{ id: 'old', spaceId: 'club', kind: 'note', title: 'May receipt' }], skipped: [] });
      if (path === '/tidy/apply') {
        expect(JSON.parse(String(init?.body))).toEqual({ action: 'tag', tagId: 'finance', itemIds: ['old'] });
        return json({ batch: { ...batch, action: 'tag', tag: finance }, skipped: [] }, 201);
      }
      return undefined;
    });
    await render('/spaces/club/tags');

    const form = [...container.querySelectorAll('form')].find((candidate) => candidate.textContent?.includes('New rule'))!;
    form.querySelector<HTMLInputElement>('input[name="titleContains"]')!.value = 'receipt';
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('New items with “receipt” in the title will be tagged Finance.');

    await act(async () => button('Tag existing items').click());
    expect(document.querySelector('dialog')?.textContent).toContain('May receipt');
    await act(async () => [...document.querySelectorAll('dialog button')].find((candidate) => candidate.textContent === 'Add the tag')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tidy/apply', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Tagged 1 item Finance. You can undo it from Tidy.');
  });
  it('finds duplicate files in a local folder without uploading them and deletes the chosen copy', async () => {
    const fetchMock = serve(() => undefined);
    await render('/tidy?view=folder');
    expect(container.textContent).toContain('Use Chrome or Edge on a computer');

    const file = (name: string, text: string, lastModified = Date.now()) => ({
      kind: 'file' as const,
      name,
      getFile: () => Promise.resolve(new File([text], name, { lastModified })),
    });
    const folder = (name: string, entries: unknown[]) => ({
      kind: 'directory' as const,
      name,
      values: async function* () {
        yield* entries;
      },
      removeEntry: vi.fn(() => Promise.resolve()),
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });
    const backup = folder('backup', [file('lease.pdf', 'same lease')]);
    const documents = folder('Documents', [file('lease.pdf', 'same lease', Date.now() - 1000), file('other.pdf', 'different'), file('.hidden', 'same lease'), backup]);
    vi.stubGlobal('showDirectoryPicker', vi.fn(() => Promise.resolve(documents)));
    act(() => root.unmount());
    root = createRoot(container);
    await render('/tidy?view=folder');

    await act(async () => button('Choose a folder').click());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.textContent).toContain('Looked at 3 files in Documents.');
    });
    expect(container.textContent).toContain('2 copies of 10 B');
    await act(async () => button('Select the extra copies').click());
    expect(container.textContent).toContain('1 file selected');
    await act(async () => button('Delete from this computer').click());
    expect(document.querySelector('dialog')?.textContent).toContain('backup/lease.pdf');
    await act(async () => button('Delete 1 file').click());

    expect(documents.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(backup.removeEntry).toHaveBeenCalledWith('lease.pdf');
    expect(documents.removeEntry).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('2 copies of 10 B');
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('tidy'))).toBe(false);
  });
});
