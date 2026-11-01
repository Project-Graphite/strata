import { ApiError } from './api';

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

export async function keepArticle(request: Request, bookmark: Bookmark, html: string, title?: string) {
  const { readArticle } = await import('./article-reader');
  return request<BookmarkDetails>(`/bookmarks/${bookmark.id}/article`, { method: 'PUT', body: JSON.stringify({ ...readArticle(html, bookmark.url), ...(title ? { title } : {}) }) });
}

export async function previewLink(request: Request, url: string) {
  const page = await request<FetchedPage>('/bookmarks/preview', { method: 'POST', body: JSON.stringify({ url }) }).catch(() => ({ html: null }));
  if (!page.html) return { url };
  const { readArticle } = await import('./article-reader');
  const { title, siteName, description } = readArticle(page.html, url);
  return { url, title: title ?? null, siteName: siteName || null, description: description || null };
}

export async function saveBookmark(request: Request, spaceId: string, url: string) {
  const saved = await request<FetchedPage & { bookmark: BookmarkDetails }>(`/spaces/${spaceId}/bookmarks`, { method: 'POST', body: JSON.stringify({ url }) });
  return {
    bookmark: saved.html ? await keepArticle(request, saved.bookmark, saved.html) : saved.bookmark,
    fetchError: saved.fetchError,
  };
}

export async function quickBookmark(request: Request, spaceId: string, url: string, title: string) {
  try {
    const saved = await request<{ bookmark: Bookmark }>(`/spaces/${spaceId}/bookmarks`, { method: 'POST', body: JSON.stringify({ url, title: title || undefined, fetch: false }) });
    return { bookmark: saved.bookmark, created: true };
  } catch (reason) {
    if (!(reason instanceof ApiError && reason.status === 409)) throw reason;
    const existing = (await request<Bookmark[]>(`/me/bookmarks?spaceId=${spaceId}`)).find((bookmark) => bookmark.url === url);
    if (!existing) throw reason;
    return { bookmark: existing, created: false };
  }
}

export async function fetchArticle(request: Request, bookmark: Bookmark, title: string) {
  const page = await request<FetchedPage>(`/bookmarks/${bookmark.id}/fetch`, { method: 'POST' });
  return page.html ? keepArticle(request, bookmark, page.html, title) : bookmark;
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
