export interface ImportSource {
  id: string;
  path: string;
  title: string;
  body: string;
  parentPath?: string;
  notionId?: string;
  blocked?: string;
}

const notionId = /\s+([0-9a-f]{32})$/i;
export const importPath = (file: File) => (file.webkitRelativePath || file.name).replaceAll('\\', '/').normalize('NFC');
export const importFolder = (path: string) => path.split('/').slice(0, -1).join('/');

export function resolveImportPath(folder: string, reference: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:|[/\\])/i.test(reference)) return undefined;
  let decoded: string;
  try { decoded = decodeURIComponent(reference.split(/[?#]/)[0]!).replaceAll('\\', '/').normalize('NFC'); } catch { return undefined; }
  const parts = folder ? folder.split('/') : [];
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (!parts.length) return undefined;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

export function titleAndBody(markdown: string, path: string) {
  const heading = /^\s*#\s+(.+?)\s*#*\s*$/.exec(markdown.split('\n').find((line) => line.trim()) ?? '');
  const fallback = path.split('/').pop()!.replace(/\.(md|markdown)$/i, '').replace(notionId, '');
  return heading
    ? { title: heading[1]!.slice(0, 200), body: markdown.slice(markdown.indexOf(heading[0]) + heading[0].length) }
    : { title: fallback.slice(0, 200), body: markdown };
}

export async function importSources(files: File[]): Promise<ImportSource[]> {
  const sources: ImportSource[] = [];
  const paths = new Set<string>();
  let preparedBytes = 0;
  for (const file of files.filter((file) => /\.(md|markdown)$/i.test(file.name)).sort((a, b) => importPath(a).split('/').length - importPath(b).split('/').length || importPath(a).localeCompare(importPath(b)))) {
    const path = importPath(file);
    if (paths.has(path)) throw new Error(`More than one selected file has the path ${path}`);
    paths.add(path);
    const blocked = file.size > 8 * 1024 * 1024 ? 'Over the 8 MB Markdown preparation limit' : preparedBytes + file.size > 64 * 1024 * 1024 ? 'This selection exceeds the 64 MB Markdown preparation limit' : undefined;
    if (!blocked) preparedBytes += file.size;
    sources.push({ id: crypto.randomUUID(), path, ...titleAndBody(blocked ? '' : await file.text(), path), notionId: notionId.exec(path.replace(/\.(md|markdown)$/i, ''))?.[1]?.toLowerCase(), blocked });
  }
  const byStem = new Map(sources.map((source) => [source.path.replace(/\.(md|markdown)$/i, ''), source.path]));
  for (const source of sources) {
    let folder = importFolder(source.path);
    while (folder) {
      if (byStem.has(folder)) { source.parentPath = byStem.get(folder); break; }
      folder = importFolder(folder);
    }
  }
  return sources;
}

export function importTargets(sources: ImportSource[]) {
  const byPath = new Map(sources.map((source) => [source.path, source]));
  const folded = new Map<string, ImportSource | undefined>();
  const notion = new Map<string, ImportSource | undefined>();
  for (const source of sources) {
    folded.set(source.path.toLowerCase(), folded.has(source.path.toLowerCase()) ? undefined : source);
    if (source.notionId) notion.set(source.notionId, notion.has(source.notionId) ? undefined : source);
  }
  return (source: ImportSource, href: string) => {
    if (href.startsWith('#')) return source;
    const path = resolveImportPath(importFolder(source.path), href);
    if (path) return byPath.get(path) ?? folded.get(path.toLowerCase());
    if (/^https:\/\/(?:www\.)?notion\.so\//i.test(href)) {
      const id = /([0-9a-f]{32})$/i.exec(new URL(href).pathname)?.[1]?.toLowerCase();
      if (id) return notion.get(id);
    }
    return undefined;
  };
}
