import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { markdownToHtml } from '../src/markdown';
import { documentState, importPages, titleAndBody } from '../src/page-import';

const decoded = (state: string) => {
  const document = new Y.Doc();
  Y.applyUpdate(document, Uint8Array.from(atob(state), (character) => character.charCodeAt(0)));
  return document.getXmlFragment('default').toString();
};

function inFolder(path: string, content: BlobPart, type = 'text/markdown') {
  const file = new File([content], path.split('/').pop()!, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

describe('Markdown import', () => {
  it('turns Markdown into the blocks pages use, keeping text literal', () => {
    const html = markdownToHtml(
      [
        '## Plan *soon*',
        'Use **bold**, _this_, snake_case_name, `a < b` and ~~old~~ with [a site](https://example.com) and [a page](Other%20abc.md).',
        '',
        '- [x] Book flights',
        '  - [ ] Seats',
        '- [ ] Pack',
        '',
        '1. One',
        '2. Two',
        '',
        '> Quoted <script>alert(1)</script>',
        '',
        '| Day | Place |',
        '| --- | --- |',
        '| Mon | Rome |',
        '',
        '<aside>',
        '💡 Bring cash',
        '</aside>',
        '',
        '```',
        'let x = 1 < 2;',
        '```',
        '---',
        '![Map](images/map.png)',
        '![Logo](https://example.com/logo.png)',
      ].join('\n'),
      (src) => (src === 'images/map.png' ? 'file-1' : undefined),
    );
    expect(html).toContain('<h2>Plan <em>soon</em></h2>');
    expect(html).toContain('Use <strong>bold</strong>, <em>this</em>, snake_case_name, <code>a &lt; b</code> and <s>old</s> with <a href="https://example.com">a site</a> and a page.');
    expect(html).toContain(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Book flights</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Seats</p></li></ul></li><li data-type="taskItem" data-checked="false"><p>Pack</p></li></ul>',
    );
    expect(html).toContain('<ol><li><p>One</p></li><li><p>Two</p></li></ol>');
    expect(html).toContain('<blockquote><p>Quoted &lt;script&gt;alert(1)&lt;/script&gt;</p></blockquote>');
    expect(html).toContain('<table><tbody><tr><th><p>Day</p></th><th><p>Place</p></th></tr><tr><td><p>Mon</p></td><td><p>Rome</p></td></tr></tbody></table>');
    expect(html).toContain('<div data-callout><p>💡 Bring cash</p></div>');
    expect(html).toContain('<pre><code>let x = 1 &lt; 2;</code></pre><hr>');
    expect(html).toContain('<img alt="Map" data-file-id="file-1" src="">');
    expect(html).toContain('<p><a href="https://example.com/logo.png">Logo</a></p>');
  });

  it('stores the converted page in the format the live editor reads', () => {
    const xml = decoded(documentState(markdownToHtml('# Trip\n\nSee **Rome**\n\n- [ ] Pack\n\n![Map](map.png)', () => 'file-1')));
    expect(xml).toContain('<heading level="1">Trip</heading>');
    expect(xml).toContain('<paragraph>See <bold>Rome</bold></paragraph>');
    expect(xml).toContain('<tasklist><taskitem checked="false"><paragraph>Pack</paragraph></taskitem></tasklist>');
    expect(xml).toContain('fileId="file-1"');
  });

  it('takes the title from the first heading, or from the file name without the Notion id', () => {
    expect(titleAndBody('# Rome trip\n\nDay one', 'Rome trip 0123456789abcdef0123456789abcdef.md')).toEqual({ title: 'Rome trip', body: '\n\nDay one' });
    expect(titleAndBody('Day one', 'Export/Rome trip 0123456789abcdef0123456789abcdef.md')).toEqual({ title: 'Rome trip', body: 'Day one' });
  });

  it('imports a Notion folder with nested pages and their images', async () => {
    const calls: { path: string; body: unknown }[] = [];
    const request = vi.fn((path: string, init?: RequestInit) => {
      if (path === '/spaces/home/files') {
        calls.push({ path, body: 'image' });
        return Promise.resolve({ id: 'file-9' });
      }
      const body = JSON.parse(String(init!.body));
      calls.push({ path, body });
      return Promise.resolve({ id: `page-${calls.length}` });
    }) as unknown as <T>(path: string, init?: RequestInit) => Promise<T>;
    const id = '0123456789abcdef0123456789abcdef';
    const result = await importPages(request, 'home', [
      inFolder(`Export/Trips ${id}/Rome ${id}.md`, `# Rome\n\n![Colosseum](Rome%20${id}/colosseum.png)`),
      inFolder(`Export/Trips ${id}.md`, '# Trips\n\nWhere next?'),
      inFolder(`Export/Trips ${id}/Rome ${id}/colosseum.png`, 'png', 'image/png'),
      inFolder(`Export/Trips ${id}/budget.csv`, 'a,b', 'text/csv'),
    ]);

    expect(result).toEqual({ imported: 2, tooLong: 0 });
    expect(calls.map((call) => call.path)).toEqual(['/spaces/home/notes', '/spaces/home/files', '/spaces/home/notes']);
    expect(calls[0]!.body).toMatchObject({ title: 'Trips' });
    expect(calls[0]!.body).not.toHaveProperty('parentId');
    expect(calls[2]!.body).toMatchObject({ title: 'Rome', parentId: 'page-1' });
    expect(decoded((calls[2]!.body as { state: string }).state)).toContain('fileId="file-9"');
  });
});
