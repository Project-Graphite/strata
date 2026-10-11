import { Readability } from '@mozilla/readability';
import type { ArticleBlock, Inline } from './bookmarks';

const maxArticleSize = 90_000;
const blockTags = 'p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,table,img,div,section,article,figure';

function webLink(value: string | null, base: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.href.length <= 2_000 ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function collectInlines(node: Node, base: string, parts: Inline[], href?: string) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent!.replace(/\s+/g, ' ');
      const last = parts.at(-1);
      if (last && last.href === href) last.text += text;
      else if (text) parts.push(href ? { text, href } : { text });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;
      collectInlines(element, base, parts, element.tagName === 'A' ? (webLink(element.getAttribute('href'), base) ?? href) : href);
    }
  }
  return parts;
}

function inlines(node: Node, base: string) {
  const parts = collectInlines(node, base, []).slice(0, 500);
  if (parts.length) {
    parts[0]!.text = parts[0]!.text.trimStart();
    parts.at(-1)!.text = parts.at(-1)!.text.trimEnd();
  }
  return parts.filter((part) => part.text).map((part) => ({ ...part, text: part.text.slice(0, 20_000) }));
}

function image(element: Element, base: string): ArticleBlock[] {
  const src = webLink(element.getAttribute('src'), base);
  return src ? [{ type: 'image', src, alt: (element.getAttribute('alt') ?? '').trim().slice(0, 500) }] : [];
}

function collectBlocks(node: Element, base: string, found: ArticleBlock[]) {
  for (const child of node.children) {
    const tag = child.tagName;
    if (/^H[1-6]$/.test(tag)) {
      found.push({ type: 'heading', level: Math.min(4, Math.max(2, Number(tag[1]))) as 2 | 3 | 4, content: inlines(child, base) });
    } else if (tag === 'P' || tag === 'FIGCAPTION') {
      found.push({ type: 'paragraph', content: inlines(child, base) });
      for (const picture of child.querySelectorAll('img')) found.push(...image(picture, base));
    } else if (tag === 'BLOCKQUOTE') {
      found.push({ type: 'quote', content: inlines(child, base) });
    } else if (tag === 'PRE') {
      found.push({ type: 'code', text: (child.textContent ?? '').slice(0, 50_000) });
    } else if (tag === 'UL' || tag === 'OL') {
      const items = [...child.children].filter((item) => item.tagName === 'LI').slice(0, 500);
      found.push({ type: 'list', ordered: tag === 'OL', items: items.map((item) => inlines(item, base)) });
    } else if (tag === 'IMG') {
      found.push(...image(child, base));
    } else if (tag === 'TABLE') {
      for (const row of child.querySelectorAll('tr')) {
        const cells = [...row.children].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (cells.length) found.push({ type: 'paragraph', content: [{ text: cells.join(' · ').slice(0, 20_000) }] });
      }
    } else if (child.querySelector(blockTags)) {
      collectBlocks(child, base, found);
    } else {
      found.push({ type: 'paragraph', content: inlines(child, base) });
    }
  }
  return found;
}

function filled(block: ArticleBlock) {
  if (block.type === 'list') return block.items.some((item) => item.length > 0);
  if (block.type === 'code') return block.text.trim() !== '';
  if (block.type === 'image') return true;
  return block.content.length > 0;
}

function withinSize(blocks: ArticleBlock[]) {
  const kept: ArticleBlock[] = [];
  let size = 0;
  for (const block of blocks.filter(filled).slice(0, 2_000)) {
    size += JSON.stringify(block).length;
    if (size > maxArticleSize) break;
    kept.push(block);
  }
  return kept;
}

function withoutSiteName(title: string, siteName: string) {
  const suffix = [' | ', ' - ', ' – ', ' — ', ' · '].map((separator) => separator + siteName).find((ending) => siteName && title.endsWith(ending));
  return suffix ? title.slice(0, -suffix.length) : title;
}

export function readArticle(html: string, url: string) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const baseElement = page.createElement('base');
  baseElement.href = url;
  page.head.prepend(baseElement);
  const meta = (...names: string[]) =>
    names.map((name) => page.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim()).find(Boolean) ?? '';
  const pageTitle = page.title.trim();
  const article = new Readability<Element>(page, { serializer: (node) => node as Element }).parse();
  const siteName = meta('og:site_name') || article?.siteName || '';
  const description = meta('og:description', 'description', 'twitter:description');
  return {
    title: withoutSiteName(meta('og:title', 'twitter:title') || article?.title || pageTitle, siteName).slice(0, 200) || undefined,
    siteName: siteName.slice(0, 200),
    description: (description || article?.excerpt || '').slice(0, 1_000),
    byline: (article?.byline ?? '').slice(0, 200),
    blocks: article?.content ? withinSize(collectBlocks(article.content, url, [])) : [],
  };
}
