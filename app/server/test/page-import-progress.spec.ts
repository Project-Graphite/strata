import { describe, expect, it } from 'vitest';
import { parseImportProgress, readImportProgress, saveImportProgress, verifyImportSources } from '../../frontend/src/page-import-progress';

function file(path: string, body: string) {
  const file = new File([body], path.split('/').at(-1)!);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

async function saved() {
  const source = file('Export/Root.md', '# Root\n[Child](Root/Child.md)');
  const child = file('Export/Root/Child.md', '# Child\nOriginal');
  const image = file('Export/photo.png', 'image bytes');
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const uploaded = crypto.randomUUID();
  const body = await saveImportProgress({
    pages: [
      { path: source.webkitRelativePath, id: first, images: new Set([image.webkitRelativePath]), created: true, nested: true, indexed: false },
      { path: child.webkitRelativePath, id: second, images: new Set(), created: false, nested: false, indexed: false },
    ],
    files: new Map([source, child, image].map((file) => [file.webkitRelativePath, file])),
    uploaded: new Map([[image.webkitRelativePath, uploaded]]), omitted: new Map(),
  } as never, 'account', 'space');
  const progress = await readImportProgress(new File([body], 'saved.strata-import'));
  return { source, child, image, first, second, uploaded, progress, body };
}

describe('portable import progress', () => {
  it('retains completed and unknown-result page IDs and uploaded media across a file round trip', async () => {
    const current = await saved();
    expect(current.progress.pages).toEqual([
      { path: 'Export/Root.md', id: current.first, created: true, nested: true, indexed: false },
      { path: 'Export/Root/Child.md', id: current.second, created: false, nested: false, indexed: false },
    ]);
    expect(current.progress.uploaded).toEqual([{ path: 'Export/photo.png', id: current.uploaded }]);
    await expect(verifyImportSources([current.source, current.child, current.image], current.progress, 'account', 'space')).resolves.toBeUndefined();
    expect(await current.body.text()).not.toContain('Original');
  });

  it('rejects another account, another space and changed content with the same size', async () => {
    const current = await saved();
    const files = [current.source, current.child, current.image];
    await expect(verifyImportSources(files, current.progress, 'other', 'space')).rejects.toThrow('original account and space');
    await expect(verifyImportSources(files, current.progress, 'account', 'elsewhere')).rejects.toThrow('original account and space');
    await expect(verifyImportSources([current.source, file('Export/Root/Child.md', '# Child\nModified'), current.image], current.progress, 'account', 'space')).rejects.toThrow('missing or changed');
    await expect(verifyImportSources([current.source, current.child, file('Export/photo.png', 'other bytes')], current.progress, 'account', 'space')).rejects.toThrow('missing or changed');
  });

  it('refuses missing sources, added pages and duplicate source paths', async () => {
    const current = await saved();
    await expect(verifyImportSources([current.source, current.child], current.progress, 'account', 'space')).rejects.toThrow('missing or changed');
    await expect(verifyImportSources([current.source, current.child, current.image, file('Extra.md', 'New')], current.progress, 'account', 'space')).rejects.toThrow('same Markdown files');
    await expect(verifyImportSources([current.source, current.source, current.child, current.image], current.progress, 'account', 'space')).rejects.toThrow('duplicate paths');
  });

  it('rejects invalid state, duplicate IDs and absent file hashes and drops unrecognized fields', async () => {
    const { progress } = await saved();
    expect(() => parseImportProgress({ ...progress, pages: progress.pages.map((page) => ({ ...page, id: progress.pages[0]!.id })) })).toThrow('duplicate paths or IDs');
    expect(() => parseImportProgress({ ...progress, pages: [{ ...progress.pages[1], nested: true }] })).toThrow('invalid');
    expect(() => parseImportProgress({ ...progress, files: progress.files.map((file) => ({ ...file, sha256: null })) })).toThrow('invalid');
    expect(parseImportProgress({ ...progress, pages: progress.pages.map((page) => ({ ...page, body: 'Untrusted body', images: 'Untrusted images' })) })).toEqual(progress);
  });

  it('rejects malformed and oversized progress files before interpreting their records', async () => {
    await expect(readImportProgress(new File(['{broken'], 'bad.strata-import'))).rejects.toThrow('could not be read');
    await expect(readImportProgress({ size: 2 * 1024 * 1024 + 1, text: async () => { throw new Error('Must not read'); } } as File)).rejects.toThrow('at most 2 MB');
  });

  it('keeps omitted media records when saving an already resumed plan', async () => {
    const source = file('Page.md', '# Page');
    const omitted = file('bad.png', 'unsupported');
    const body = await saveImportProgress({ pages: [{ path: 'Page.md', id: crypto.randomUUID(), images: new Set(), created: true, nested: true, indexed: true }], files: new Map([['Page.md', source], ['bad.png', omitted]]), uploaded: new Map(), omitted: new Map([['bad.png', 'Unsupported media']]) } as never, 'account', 'space');
    const progress = await readImportProgress(new File([body], 'saved.strata-import'));
    expect(progress.omitted).toEqual([{ path: 'bad.png', reason: 'Unsupported media' }]);
    await expect(verifyImportSources([source, omitted], progress, 'account', 'space')).resolves.toBeUndefined();
  });
});
