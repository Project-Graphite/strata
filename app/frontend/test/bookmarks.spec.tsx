import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { readArticle } from '../src/article-reader';
import { AuthProvider } from '../src/auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = { id: 'me', email: 'amr@example.com', handle: 'amr', displayName: 'Amr', role: 'member', timeZone: 'Etc/UTC' };
const spaces = [{ id: 'home', name: 'Home', color: 'teal', kind: 'personal', role: 'owner', createdAt: '2026-10-01T00:00:00Z' }];
const sentence = 'Sourdough rises slowly because wild yeast works at its own pace, and the long ferment builds flavour. ';

const page = `<!doctype html><html><head>
<title>Slow bread | Bread Weekly</title>
<meta property="og:site_name" content="Bread Weekly">
<meta name="description" content="Why sourdough takes time">
<script>window.stolen = true</script>
</head><body>
<nav><a href="/">Home</a><a href="/shop">Shop</a></nav>
<article>
<h1>Slow bread</h1>
<p class="byline">By A. Baker</p>
<p>${sentence.repeat(4)}Read the <a href="/levain">levain guide</a> or <a href="javascript:alert(1)">this</a>.</p>
<h3>What you need</h3>
<ol><li>Flour</li><li>Water</li></ol>
<p>${sentence.repeat(3)}</p>
<img src="/loaf.jpg" alt="A crusty loaf">
<pre>hydration = 0.75</pre>
<p onclick="alert(1)">${sentence.repeat(2)}</p>
</article>
<footer>Copyright Bread Weekly</footer>
</body></html>`;

describe('Bookmarks', () => {
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
      if (path === '/spaces') return Promise.resolve(json(spaces));
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

  it('reads the article out of a page as plain blocks, without scripts, menus or unsafe links', () => {
    const article = readArticle(page, 'https://bread.example/slow');
    expect(article).toMatchObject({ title: 'Slow bread', siteName: 'Bread Weekly', description: 'Why sourdough takes time' });
    expect(article.blocks).toContainEqual({ type: 'list', ordered: true, items: [[{ text: 'Flour' }], [{ text: 'Water' }]] });
    expect(article.blocks).toContainEqual({ type: 'image', src: 'https://bread.example/loaf.jpg', alt: 'A crusty loaf' });
    expect(article.blocks).toContainEqual({ type: 'code', text: 'hydration = 0.75' });
    const first = article.blocks.find((block) => block.type === 'paragraph')!;
    expect(first.type === 'paragraph' && first.content).toEqual([
      { text: `${sentence.repeat(4)}Read the ` },
      { text: 'levain guide', href: 'https://bread.example/levain' },
      { text: ' or this.' },
    ]);
    const text = JSON.stringify(article.blocks);
    for (const unwanted of ['stolen', 'Shop', 'Copyright', 'javascript', 'onclick']) expect(text).not.toContain(unwanted);
  });

  it('saves a pasted link with its article and lists it to read later', async () => {
    let saved = false;
    const fetchMock = serve((path, init) => {
      const bookmark = { id: 'b1', spaceId: 'home', title: 'bread.example', url: 'https://bread.example/slow', siteName: null, description: null, readAt: null, createdAt: '2026-10-11T08:00:00Z', updatedAt: '2026-10-11T08:00:00Z' };
      if (path === '/me/bookmarks?status=unread') return json(saved ? [{ ...bookmark, title: 'Slow bread', siteName: 'Bread Weekly' }] : []);
      if (path === '/spaces/home/bookmarks' && init?.method === 'POST') return json({ bookmark: { ...bookmark, article: null }, html: page, fetchError: null }, 201);
      if (path === '/bookmarks/b1/article' && init?.method === 'PUT') {
        saved = true;
        return json({ ...bookmark, ...JSON.parse(String(init.body)) });
      }
      return undefined;
    });
    await render('/bookmarks');
    expect(container.textContent).toContain('Nothing to read later');

    const input = container.querySelector<HTMLInputElement>('input[name="url"]')!;
    await act(async () => {
      input.value = 'https://bread.example/slow';
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Slow bread'));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/spaces/home/bookmarks', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://bread.example/slow' }) }));
    const stored = JSON.parse(String(fetchMock.mock.calls.find(([path]) => path === '/api/v1/bookmarks/b1/article')![1]!.body));
    expect(stored).toMatchObject({ title: 'Slow bread', siteName: 'Bread Weekly', blocks: expect.arrayContaining([expect.objectContaining({ type: 'code' })]) });
    expect(container.textContent).toContain('Bread Weekly · Home · saved');
  });

  it('shows the article in the reader view, marks it read and keeps links pointing away safely', async () => {
    const bookmark = {
      id: 'b2',
      spaceId: 'home',
      title: 'Slow bread',
      url: 'https://bread.example/slow',
      siteName: 'Bread Weekly',
      description: 'Why sourdough takes time',
      readAt: null,
      createdAt: '2026-10-11T08:00:00Z',
      updatedAt: '2026-10-11T08:00:00Z',
      article: {
        byline: 'A. Baker',
        blocks: [
          { type: 'heading', level: 2, content: [{ text: 'Starter' }] },
          { type: 'paragraph', content: [{ text: 'Feed the ' }, { text: 'levain', href: 'https://bread.example/levain' }] },
          { type: 'quote', content: [{ text: '<b>Patience</b>' }] },
          { type: 'image', src: 'https://bread.example/loaf.jpg', alt: 'A crusty loaf' },
        ],
      },
    };
    const fetchMock = serve((path, init) => {
      if (path === '/bookmarks/b2' && init?.method === 'PATCH') return json({ ...bookmark, readAt: '2026-10-11T09:00:00Z' });
      if (path === '/bookmarks/b2') return json(bookmark);
      return undefined;
    });
    await render('/bookmarks/b2');
    await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Slow bread'));

    expect(container.textContent).toContain('Bread Weekly · A. Baker · 1 min read');
    expect(container.querySelector('h2')?.textContent).toBe('Starter');
    expect(container.querySelector('blockquote')?.textContent).toBe('<b>Patience</b>');
    expect(container.querySelector('blockquote b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    const link = container.querySelector<HTMLAnchorElement>('a[href="https://bread.example/levain"]')!;
    expect(link.rel).toBe('noopener noreferrer nofollow');
    expect(link.target).toBe('_blank');
    expect(container.querySelector('a[href="https://bread.example/loaf.jpg"]')?.textContent).toBe('Image: A crusty loaf');
    await vi.waitFor(() => expect(container.textContent).toContain('Read later'));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/bookmarks/b2', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ read: true }) }));
  });
});
