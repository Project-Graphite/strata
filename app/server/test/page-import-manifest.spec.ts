import { describe, expect, it } from 'vitest';
import { importSources, importTargets, resolveImportPath, titleAndBody } from '../../frontend/src/page-import-manifest';
import { markdownToHtml } from '../../frontend/src/markdown';

function file(path: string, text = '', size = Buffer.byteLength(text)) {
  return { name: path.split('/').at(-1), webkitRelativePath: path, size, text: async () => text } as File;
}

describe('page import manifest', () => {
  it('allocates stable unique IDs before import and nests under the nearest selected ancestor', async () => {
    const sources = await importSources([file('Export/Root/Child/Deep.md', '# Deep\nBody'), file('Export/Root.md', '# Root\nRoot body'), file('Export/Root/Child.md', '# Child\nChild body')]);
    expect(sources.map((source) => source.path)).toEqual(['Export/Root.md', 'Export/Root/Child.md', 'Export/Root/Child/Deep.md']);
    expect(sources[1]!.parentPath).toBe(sources[0]!.path);
    expect(sources[2]!.parentPath).toBe(sources[1]!.path);
    expect(new Set(sources.map((source) => source.id)).size).toBe(3);
    expect(sources[2]!.body.trim()).toBe('Body');
    const target = importTargets(sources);
    expect(target(sources[0]!, 'Root/Child.md')).toBe(sources[1]);
    expect(target(sources[1]!, '../Root.md#section')).toBe(sources[0]);
    expect(target(sources[1]!, '#section')).toBe(sources[1]);
  });

  it('resolves encoded paths, normalized Unicode and Notion IDs without matching unrelated hosts', async () => {
    const id = 'a'.repeat(32);
    const sources = await importSources([file('Export/Cafe\u0301 & tea.md'), file(`Export/Notion ${id}.md`)]);
    const target = importTargets(sources);
    expect(target(sources[0]!, 'Caf%C3%A9%20%26%20tea.md')).toBe(sources[0]);
    expect(target(sources[0]!, `https://www.notion.so/Some-title-${id}?x=1#section`)).toBe(sources[1]);
    expect(target(sources[0]!, `https://notion.so.evil.test/${id}`)).toBeUndefined();
    expect(sources[1]!.title).toBe('Notion');
  });

  it('rejects duplicate canonical paths and ambiguous case-insensitive matches', async () => {
    await expect(importSources([file('Same.md'), file('Same.md')])).rejects.toThrow('More than one');
    const sources = await importSources([file('A.md'), file('a.md')]);
    const target = importTargets(sources);
    expect(target(sources[0]!, 'A.md')).toBe(sources.find((source) => source.path === 'A.md'));
    expect(target(sources[0]!, './a.MD')).toBeUndefined();
  });

  it.each(['../../outside.md', 'https://example.com/page.md', '/absolute.md', 'file:private.md', 'broken%ZZ.md'])('does not resolve unsafe or nonlocal reference %s', (reference) => {
    expect(resolveImportPath('Export', reference)).toBeUndefined();
  });

  it('reports oversized source files without reading their content', async () => {
    const large = file('Huge.md', '', 8 * 1024 * 1024 + 1);
    large.text = async () => { throw new Error('Must not read oversized files'); };
    expect((await importSources([large]))[0]).toMatchObject({ title: 'Huge', body: '', blocked: 'Over the 8 MB Markdown preparation limit' });
    expect(titleAndBody('Body without a title', `Page ${'b'.repeat(32)}.md`)).toEqual({ title: 'Page', body: 'Body without a title' });
  });
});

describe('imported Markdown links', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const convert = (body: string) => markdownToHtml(body, () => undefined, (href) => href === 'Child.md' ? `/notes/${id}` : undefined);

  it('maps links in headings, quotes, nested lists and tables while preserving code', () => {
    const result = convert('# [Child](Child.md)\n\n> [Child](Child.md)\n\n- Parent\n  - [Child](Child.md)\n\n| Page |\n| --- |\n| [Child](Child.md) |\n\n`[Child](Child.md)`\n\n```\n[Child](Child.md)\n```');
    expect(result.match(new RegExp(`href="/notes/${id}"`, 'g'))).toHaveLength(4);
    expect(result).toContain('<code>[Child](Child.md)</code>');
    expect(result).toContain('<pre><code>[Child](Child.md)</code></pre>');
  });

  it('rejects unsafe mapping output, escapes link attributes and retains missing image descriptions', () => {
    expect(markdownToHtml('[Unsafe](x)', () => undefined, () => 'javascript:alert(1)')).toBe('<p>Unsafe</p>');
    expect(markdownToHtml('[Unsafe](x)', () => undefined, () => '/notes/private')).toBe('<p>Unsafe</p>');
    expect(convert('[Web](https://example.com/?a=1&b=%22)')).toContain('href="https://example.com/?a=1&amp;b=%22"');
    expect(convert('![Missing <photo>](missing.png)')).toBe('<p>Missing &lt;photo&gt;</p>');
    expect(convert('[**Bold label**](https://example.com/a_b_c?x=~~ok~~)')).toBe('<p><a href="https://example.com/a_b_c?x=~~ok~~"><strong>Bold label</strong></a></p>');
  });
});
