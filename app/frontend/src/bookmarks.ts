export interface Inline {
  text: string;
  href?: string;
}

export type ArticleBlock =
  | { type: 'heading'; level: 2 | 3 | 4; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'quote'; content: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }
  | { type: 'image'; src: string; alt: string };

export interface Bookmark {
  id: string;
  spaceId: string;
  title: string;
  url: string;
  siteName: string | null;
  description: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkDetails extends Bookmark {
  article: { byline: string | null; blocks: ArticleBlock[] } | null;
}

export interface FetchedPage {
  html: string | null;
  fetchError: string | null;
}

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function keepArticle(request: Request, bookmark: Bookmark, html: string) {
  const { readArticle } = await import('./article-reader');
  return request<BookmarkDetails>(`/bookmarks/${bookmark.id}/article`, { method: 'PUT', body: JSON.stringify(readArticle(html, bookmark.url)) });
}

export async function saveBookmark(request: Request, spaceId: string, url: string) {
  const saved = await request<FetchedPage & { bookmark: BookmarkDetails }>(`/spaces/${spaceId}/bookmarks`, { method: 'POST', body: JSON.stringify({ url }) });
  return {
    bookmark: saved.html ? await keepArticle(request, saved.bookmark, saved.html) : saved.bookmark,
    fetchError: saved.fetchError,
  };
}

export function firstLink(...texts: string[]) {
  for (const text of texts) {
    const found = text.match(/https?:\/\/[^\s<>"']+/)?.[0];
    if (found) return found;
  }
  return '';
}

export function siteLabel(bookmark: Bookmark) {
  return bookmark.siteName || new URL(bookmark.url).hostname.replace(/^www\./, '');
}
