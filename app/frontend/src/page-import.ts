import { generateJSON, type JSONContent } from '@tiptap/core';
import * as Y from 'yjs';
import { pageContent } from './components/note-extensions';
import { maxUploadBytes } from './files';
import { imageSources, markdownToHtml } from './markdown';
import { encodedPageState, maxPageStateBytes, pageDraftBody } from './draft-format';
import { importFolder, importPath, importSources, importTargets, resolveImportPath, type ImportSource } from './page-import-manifest';
import { recoverDraftPart } from './draft-parts';
import { ApiError } from './api';
import type { ImportProgress } from './page-import-progress';

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

interface ImportPage extends ImportSource {
  images: Set<string>;
  references: Set<string>;
  issues: string[];
  created: boolean;
  nested: boolean;
  indexed: boolean;
  error?: string;
}

export interface PageImportPlan {
  pages: ImportPage[];
  files: Map<string, File>;
  uploaded: Map<string, string>;
  imageIds: Map<string, string>;
  omitted: Map<string, string>;
  target: ReturnType<typeof importTargets>;
}

function fill(parent: Y.XmlFragment | Y.XmlElement, content: JSONContent[]) {
  let texts: { insert: string; attributes: Record<string, unknown> }[] = [];
  let mention: { id: string; href: string; label: string } | undefined;
  const flush = () => {
    if (texts.length) {
      const text = new Y.XmlText();
      parent.insert(parent.length, [text]);
      text.applyDelta(texts);
      texts = [];
    }
    if (mention) {
      const element = new Y.XmlElement('mention');
      parent.insert(parent.length, [element]);
      for (const [key, value] of Object.entries(mention)) element.setAttribute(key, value);
      mention = undefined;
    }
  };
  for (const node of content) {
    if (node.type === 'text') {
      const href = node.marks?.find((mark) => mark.type === 'link')?.attrs?.href;
      const linked = typeof href === 'string' ? /^\/notes\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(href) : null;
      if (linked) {
        if (texts.length || mention?.href !== href) flush();
        if (mention) mention.label += node.text ?? '';
        else mention = { id: linked[1]!, href, label: node.text ?? '' };
        continue;
      }
      if (mention) flush();
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

function documentState(html: string) {
  const document = new Y.Doc();
  try {
    fill(document.getXmlFragment('default'), generateJSON(html, pageContent((() => Promise.reject(new Error('Not available'))) as Request, '')).content ?? []);
    return encodedPageState(Y.encodeStateAsUpdate(document));
  } finally {
    document.destroy();
  }
}

function pageHtml(plan: PageImportPlan, page: ImportPage, images: Map<string, string>) {
  const issues = new Set(page.issues);
  let imageBlocks = 0;
  const html = markdownToHtml(page.body, (src) => {
    imageBlocks += 1;
    const path = resolveImportPath(importFolder(page.path), src);
    const file = path ? plan.files.get(path) : undefined;
    if (!path || !file) { issues.add(`Missing image: ${src}`); return undefined; }
    if (file.size > maxUploadBytes) { issues.add(`Image over 25 MB: ${src}`); return undefined; }
    if (plan.omitted.has(path)) { issues.add(`Image not imported: ${src}. ${plan.omitted.get(path)}`); return undefined; }
    page.images.add(path);
    return images.get(path);
  }, (href) => {
    const target = plan.target(page, href) as ImportPage | undefined;
    if (target && !target.blocked) {
      page.references.add(target.id);
      if (href.includes('#')) issues.add('Page-link anchors become links to the whole page');
      return `/notes/${target.id}`;
    }
    if (target?.blocked) issues.add(`Linked page is skipped: ${target.path}`);
    else if (!/^(https?:|mailto:)/i.test(href)) issues.add(`Page link not found in the selection: ${href}`);
    return undefined;
  });
  if (imageSources(page.body).length > imageBlocks) issues.add('Image references outside supported standalone blocks remain text or links');
  page.issues = [...issues];
  return html;
}

export async function preparePageImport(files: File[], progress?: ImportProgress): Promise<PageImportPlan> {
  const pages: ImportPage[] = (await importSources(files)).map((source) => ({ ...source, images: new Set(), references: new Set(), issues: [], created: false, nested: false, indexed: false }));
  if (progress) for (const page of pages) Object.assign(page, progress.pages.find((saved) => saved.path === page.path));
  const plan: PageImportPlan = { pages, files: new Map(files.map((file) => [importPath(file), file])), uploaded: new Map(progress?.uploaded.map(({ path, id }) => [path, id])), imageIds: new Map(files.map((file) => [importPath(file), crypto.randomUUID()])), omitted: new Map(progress?.omitted.map(({ path, reason }) => [path, reason])), target: importTargets(pages) };
  for (const page of pages) {
    if (page.blocked) continue;
    if (page.parentPath && pages.find((parent) => parent.path === page.parentPath)?.blocked) { page.blocked = `Parent page is skipped: ${page.parentPath}`; continue; }
    try {
      if (atob(documentState(pageHtml(plan, page, plan.imageIds))).length > maxPageStateBytes) page.blocked = 'The converted page exceeds 5 MB';
    } catch (error) {
      page.blocked = error instanceof Error ? error.message : 'This page could not be converted';
    }
  }
  return plan;
}

export async function runPageImport(request: Request, spaceId: string, plan: PageImportPlan, progress: () => void, signal?: AbortSignal) {
  const send: Request = (path, init) => request(path, { ...init, signal });
  for (const page of plan.pages) {
    if (signal?.aborted) return;
    if (page.blocked) continue;
    page.error = undefined;
    try {
      const parent = page.parentPath ? plan.pages.find((candidate) => candidate.path === page.parentPath) : undefined;
      if (parent && (!parent.created || !parent.nested)) throw new Error('Finish importing the parent before this page');
      if (!page.created) {
        for (const path of page.images) {
          if (plan.uploaded.has(path) || plan.omitted.has(path)) continue;
          const image = plan.files.get(path)!;
          try {
            plan.uploaded.set(path, (await send<{ id: string }>(`/spaces/${spaceId}/files`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(image.name) }, body: image })).id);
          } catch (error) {
            if (!(error instanceof ApiError && [400, 413, 415].includes(error.status))) throw error;
            plan.omitted.set(path, error.message);
          }
          progress();
        }
        page.references.clear();
        const state = documentState(pageHtml(plan, page, plan.uploaded));
        if (atob(state).length > maxPageStateBytes) throw new Error('The converted page exceeds 5 MB. Uploaded images are kept in the space.');
        const saved = await recoverDraftPart(send, spaceId, { id: page.id, title: page.title, body: pageDraftBody(state, 'note', page.title) });
        if (saved.id !== page.id) throw new Error('The server returned a different recovery ID; keep this dialog open');
        page.created = true;
        progress();
      }
      if (!page.nested) {
        if (parent) await send(`/notes/${page.id}`, { method: 'PATCH', body: JSON.stringify({ parentId: parent.id }) });
        page.nested = true;
      }
    } catch (error) {
      page.error = error instanceof Error ? error.message : 'This page could not be imported';
    }
    progress();
  }
  for (const page of plan.pages) {
    if (signal?.aborted) return;
    if (page.blocked || !page.created || !page.nested || page.indexed) continue;
    try {
      if ([...page.references].some((id) => plan.pages.some((target) => target.id === id && (!target.created || !target.nested)))) throw new Error('Page links are waiting for their targets to finish importing');
      const current = await send<{ outgoing: { kind: string; item: { id: string } }[] }>(`/items/${page.id}/links`);
      for (const targetId of page.references) {
        if (targetId === page.id || !plan.pages.find((candidate) => candidate.id === targetId)?.created || current.outgoing.some((link) => link.kind === 'mention' && link.item.id === targetId)) continue;
        try {
          await send(`/items/${page.id}/links`, { method: 'POST', body: JSON.stringify({ targetId, kind: 'mention' }) });
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 409)) throw error;
          if (!(await send<typeof current>(`/items/${page.id}/links`)).outgoing.some((link) => link.kind === 'mention' && link.item.id === targetId)) throw error;
        }
      }
      page.indexed = true;
    } catch (error) {
      page.error = error instanceof Error ? error.message : 'Page links could not be indexed';
    }
    progress();
  }
}
