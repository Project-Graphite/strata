import { editorFormat } from './editor-format';
import { importPath } from './page-import-manifest';
import type { PageImportPlan } from './page-import';

export interface ImportProgress {
  type: 'strata-import';
  version: 1;
  format: number;
  userId: string;
  spaceId: string;
  files: { path: string; size: number; sha256: string | null }[];
  pages: { path: string; id: string; created: boolean; nested: boolean; indexed: boolean }[];
  uploaded: { path: string; id: string }[];
  omitted: { path: string; reason: string }[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const validPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0');

export function parseImportProgress(value: unknown): ImportProgress {
  if (!object(value) || value.type !== 'strata-import' || value.version !== 1 || value.format !== editorFormat || typeof value.userId !== 'string' || typeof value.spaceId !== 'string' || !value.userId || !value.spaceId || value.userId.length > 100 || value.spaceId.length > 100) throw new Error('Choose a Strata import progress file from this editor version');
  for (const key of ['files', 'pages', 'uploaded', 'omitted']) if (!Array.isArray(value[key]) || value[key].length > 10_000) throw new Error('The import progress file is invalid');
  const { files, pages, uploaded, omitted } = value as unknown as ImportProgress;
  if (!files.every((entry) => object(entry) && validPath(entry.path) && Number.isSafeInteger(entry.size) && entry.size >= 0 && (entry.sha256 === null ? entry.size > 25 * 1024 * 1024 : typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/.test(entry.sha256))) || !pages.every((entry) => object(entry) && validPath(entry.path) && identifier(entry.id) && [entry.created, entry.nested, entry.indexed].every((flag) => typeof flag === 'boolean') && (!entry.nested || entry.created) && (!entry.indexed || entry.nested)) || !uploaded.every((entry) => object(entry) && validPath(entry.path) && identifier(entry.id)) || !omitted.every((entry) => object(entry) && validPath(entry.path) && typeof entry.reason === 'string' && entry.reason.length <= 2000)) throw new Error('The import progress file is invalid');
  if ([files, pages, uploaded, omitted].some((entries) => new Set(entries.map((entry) => entry.path)).size !== entries.length) || new Set(pages.map((entry) => entry.id)).size !== pages.length || new Set(uploaded.map((entry) => entry.id)).size !== uploaded.length) throw new Error('The import progress file contains duplicate paths or IDs');
  const known = new Set(files.map((entry) => entry.path));
  if ([...pages, ...uploaded, ...omitted].some((entry) => !known.has(entry.path))) throw new Error('The import progress file references missing source files');
  return {
    type: 'strata-import', version: 1, format: editorFormat, userId: value.userId, spaceId: value.spaceId,
    files: files.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
    pages: pages.map(({ path, id, created, nested, indexed }) => ({ path, id, created, nested, indexed })),
    uploaded: uploaded.map(({ path, id }) => ({ path, id })),
    omitted: omitted.map(({ path, reason }) => ({ path, reason })),
  };
}

export async function readImportProgress(file: File) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Import progress files can be at most 2 MB');
  let value: unknown;
  try { value = JSON.parse(await file.text()); } catch { throw new Error('That import progress file could not be read'); }
  return parseImportProgress(value);
}

async function fingerprint(file: File) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function saveImportProgress(plan: PageImportPlan, userId: string, spaceId: string) {
  const used = new Set([...plan.pages.flatMap((page) => [page.path, ...page.images]), ...plan.uploaded.keys(), ...plan.omitted.keys()]);
  const files: ImportProgress['files'] = [];
  for (const [path, file] of plan.files) {
    if (!used.has(path)) continue;
    files.push({ path, size: file.size, sha256: file.size > 25 * 1024 * 1024 ? null : await fingerprint(file) });
  }
  const body = new Blob([JSON.stringify(parseImportProgress({ type: 'strata-import', version: 1, format: editorFormat, userId, spaceId, files, pages: plan.pages.map(({ path, id, created, nested, indexed }) => ({ path, id, created, nested, indexed })), uploaded: [...plan.uploaded].map(([path, id]) => ({ path, id })), omitted: [...plan.omitted].map(([path, reason]) => ({ path, reason })) }))], { type: 'application/json' });
  if (body.size > 2 * 1024 * 1024) throw new Error('This import has too many source paths to save in a progress file');
  return body;
}

export async function verifyImportSources(files: File[], progress: ImportProgress, userId: string, spaceId: string) {
  if (progress.userId !== userId || progress.spaceId !== spaceId) throw new Error('Resume this import with the original account and space');
  const selected = new Map(files.map((file) => [importPath(file), file]));
  if (selected.size !== files.length) throw new Error('The selection contains duplicate paths');
  const pages = files.filter((file) => /\.(md|markdown)$/i.test(file.name));
  if (pages.length !== progress.pages.length || pages.some((file) => !progress.pages.some((page) => page.path === importPath(file)))) throw new Error('Choose the same Markdown files and folder paths as the saved import');
  for (const source of progress.files) {
    const file = selected.get(source.path);
    if (!file || file.size !== source.size || source.sha256 !== null && await fingerprint(file) !== source.sha256) throw new Error(`The source file is missing or changed: ${source.path}`);
  }
}
