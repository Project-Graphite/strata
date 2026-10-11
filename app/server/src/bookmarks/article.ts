import { BadRequestException } from '@nestjs/common';

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

const unreadable = () => new BadRequestException('That article could not be read');

function record(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw unreadable();
  return value as Record<string, unknown>;
}

function string(value: unknown, maxLength: number) {
  if (typeof value !== 'string' || value.length > maxLength) throw unreadable();
  return value;
}

function webLink(value: unknown) {
  const text = string(value, 2_000);
  try {
    const url = new URL(text);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    throw unreadable();
  }
  throw unreadable();
}

function inlines(value: unknown): Inline[] {
  if (!Array.isArray(value) || value.length > 500) throw unreadable();
  return value.map((entry) => {
    const part = record(entry);
    const text = string(part.text, 20_000);
    return part.href === undefined ? { text } : { text, href: webLink(part.href) };
  });
}

function block(value: unknown): ArticleBlock {
  const entry = record(value);
  switch (entry.type) {
    case 'heading':
      if (entry.level !== 2 && entry.level !== 3 && entry.level !== 4) throw unreadable();
      return { type: 'heading', level: entry.level, content: inlines(entry.content) };
    case 'paragraph':
    case 'quote':
      return { type: entry.type, content: inlines(entry.content) };
    case 'list':
      if (typeof entry.ordered !== 'boolean' || !Array.isArray(entry.items) || entry.items.length > 500) throw unreadable();
      return { type: 'list', ordered: entry.ordered, items: entry.items.map(inlines) };
    case 'code':
      return { type: 'code', text: string(entry.text, 50_000) };
    case 'image':
      return { type: 'image', src: webLink(entry.src), alt: string(entry.alt, 500) };
    default:
      throw unreadable();
  }
}

export function articleBlocks(blocks: unknown[]) {
  return blocks.map(block);
}

const words = (parts: Inline[]) => parts.map((part) => part.text).join('');

export function articleText(blocks: ArticleBlock[], maxLength = 100_000) {
  return blocks
    .map((entry) => {
      if (entry.type === 'list') return entry.items.map(words).join('\n');
      if (entry.type === 'code') return entry.text;
      if (entry.type === 'image') return entry.alt;
      return words(entry.content);
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength);
}
