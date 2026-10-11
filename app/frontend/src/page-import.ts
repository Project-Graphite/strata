import { generateJSON, type JSONContent } from '@tiptap/core';
import * as Y from 'yjs';
import { pageContent } from './components/note-extensions';
import { maxUploadBytes, uploadFile } from './files';
import { imageSources, markdownToHtml } from './markdown';

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

const maxStateLength = 100_000;
const notionId = /\s+[0-9a-f]{32}$/i;

function fill(parent: Y.XmlFragment | Y.XmlElement, content: JSONContent[]) {
  let texts: { insert: string; attributes: Record<string, unknown> }[] = [];
  const flush = () => {
    if (texts.length === 0) return;
    const text = new Y.XmlText();
    parent.insert(parent.length, [text]);
    text.applyDelta(texts);
    texts = [];
  };
  for (const node of content) {
    if (node.type === 'text') {
      texts.push({ insert: node.text ?? '', attributes: Object.fromEntries((node.marks ?? []).map((mark) => [mark.type, mark.attrs ?? {}])) });
      continue;
    }
    flush();
    const element = new Y.XmlElement(node.type);
    parent.insert(parent.length, [element]);
    for (const [key, value] of Object.entries(node.attrs ?? {})) if (value !== null && value !== '') element.setAttribute(key, value as never);
    fill(element, node.content ?? []);
  }
  flush();
}

export function documentState(html: string) {
  const document = new Y.Doc();
  fill(document.getXmlFragment('default'), generateJSON(html, pageContent((() => Promise.reject(new Error('Not available'))) as Request, '')).content ?? []);
  const update = Y.encodeStateAsUpdate(document);
  let binary = '';
  for (let start = 0; start < update.length; start += 0x8000) binary += String.fromCharCode(...update.subarray(start, start + 0x8000));
  return btoa(binary);
}

const pathOf = (file: File) => file.webkitRelativePath || file.name;
const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');

function resolved(folder: string, src: string) {
  const parts = folder ? folder.split('/') : [];
  for (const part of decodeURIComponent(src).split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

export function titleAndBody(markdown: string, path: string) {
  const heading = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(markdown.split('\n').find((line) => line.trim()) ?? '');
  const fallback = path.split('/').pop()!.replace(/\.(md|markdown)$/i, '').replace(notionId, '');
  return heading
    ? { title: heading[1]!.slice(0, 200), body: markdown.slice(markdown.indexOf(heading[0]) + heading[0].length) }
    : { title: fallback.slice(0, 200), body: markdown };
}

export async function importPages(request: Request, spaceId: string, files: File[]) {
  const byPath = new Map(files.map((file) => [pathOf(file), file]));
  const pages = files
    .filter((file) => /\.(md|markdown)$/i.test(file.name))
    .sort((a, b) => pathOf(a).split('/').length - pathOf(b).split('/').length || pathOf(a).localeCompare(pathOf(b)));
  const created = new Map<string, string>();
  const uploaded = new Map<string, string>();
  let tooLong = 0;
  for (const file of pages) {
    const path = pathOf(file);
    const folder = folderOf(path);
    const { title, body } = titleAndBody(await file.text(), path);
    for (const src of imageSources(body)) {
      const image = byPath.get(resolved(folder, src));
      if (!image || uploaded.has(pathOf(image)) || image.size > maxUploadBytes) continue;
      uploaded.set(pathOf(image), (await uploadFile(request, spaceId, image)).id);
    }
    const state = documentState(markdownToHtml(body, (src) => uploaded.get(resolved(folder, src))));
    if (state.length > maxStateLength) {
      tooLong += 1;
      continue;
    }
    const page = await request<{ id: string }>(`/spaces/${spaceId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ title, parentId: created.get(folder), state }),
    });
    created.set(path.replace(/\.(md|markdown)$/i, ''), page.id);
  }
  return { imported: created.size, tooLong };
}
