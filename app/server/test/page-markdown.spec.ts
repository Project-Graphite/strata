import { describe, expect, it } from 'vitest';
import { pageMarkdown } from '../../frontend/src/components/page-markdown';

const text = (value: string, ...marks: string[]) => ({ type: 'text', text: value, marks: marks.map((type) => ({ type })) });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const heading = (level: number, value: string) => ({ type: 'heading', attrs: { level, id: `h${level}` }, content: [text(value)] });
const item = (...content: object[]) => ({ type: 'listItem', content });
const export_ = (...content: object[]) => pageMarkdown({ type: 'doc', content }, { title: 'Trip plan', pageUrl: 'https://strata.example/notes/page-1' });

describe('page Markdown export', () => {
  it('writes text blocks, marks and lists as Markdown', () => {
    expect(
      export_(
        heading(1, 'Overview'),
        paragraph(text('Pack '), text('light ', 'bold'), text('and '), text('early', 'italic'), text(' – see '), { ...text('the map'), marks: [{ type: 'link', attrs: { href: 'https://maps.example' } }] }),
        paragraph(text('Run '), text('npm ci', 'code'), text(' then 5 * 2')),
        { type: 'bulletList', content: [item(paragraph(text('Passport'))), item(paragraph(text('Charger')), { type: 'orderedList', attrs: { start: 3 }, content: [item(paragraph(text('Cable')))] })] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph(text('Book hotel'))] }, { type: 'taskItem', attrs: { checked: false }, content: [paragraph(text('Visa'))] }] },
        paragraph(text('# not a heading')),
      ),
    ).toBe(
      [
        '# Trip plan',
        '',
        '# Overview',
        '',
        'Pack **light** and _early_ – see [the map](https://maps.example)',
        '',
        'Run `npm ci` then 5 \\* 2',
        '',
        '- Passport\n- Charger\n\n  3. Cable',
        '',
        '- [x] Book hotel\n- [ ] Visa',
        '',
        '\\# not a heading',
        '',
      ].join('\n'),
    );
  });

  it('writes code, quotes, callouts, tables and toggles', () => {
    expect(
      export_(
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;')] },
        { type: 'blockquote', content: [paragraph(text('Quoted')), paragraph(text('Twice'))] },
        { type: 'callout', attrs: { tint: 'warning' }, content: [paragraph(text('Mind the gap'))] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph(text('Day'))] }, { type: 'tableHeader', content: [paragraph(text('City'))] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(text('1'))] }, { type: 'tableCell', content: [paragraph(text('Cairo | Giza'))] }] }] },
        { type: 'details', content: [{ type: 'detailsSummary', content: [text('More')] }, { type: 'detailsContent', content: [paragraph(text('Hidden'))] }] },
      ),
    ).toBe(
      [
        '# Trip plan',
        '',
        '```ts\nconst a = 1;\n```',
        '',
        '> Quoted\n>\n> Twice',
        '',
        '> [!WARNING]\n> Mind the gap',
        '',
        '| Day | City |\n| --- | --- |\n| 1 | Cairo \\| Giza |',
        '',
        '<details>\n<summary>More</summary>\n\nHidden\n\n</details>',
        '',
      ].join('\n'),
    );
  });

  it('writes media, embeds, mentions and the contents as links', () => {
    const markdown = export_(
      heading(2, 'Plan'),
      { type: 'tableOfContents', attrs: { id: 'toc' } },
      heading(3, 'Day one'),
      { type: 'image', attrs: { id: 'img', fileId: 'file-1', alt: 'Harbour', caption: 'At dusk' } },
      { type: 'fileAttachment', attrs: { id: 'att', fileId: 'file-2', name: 'minutes.pdf' } },
      { type: 'linkCard', attrs: { url: 'https://example.com/docs', title: 'Example docs', description: 'How it works' } },
      { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=abc' } },
      paragraph(text('See '), { type: 'mention', attrs: { id: 'p2', label: 'Budget', href: '/notes/p2', mentionSuggestionChar: '[[' } }, text(' with '), { type: 'personMention', attrs: { id: 'u1', label: 'Mona' } }),
    );
    expect(markdown).toContain('- Plan\n  - Day one');
    expect(markdown).toContain('[Image: Harbour](https://strata.example/notes/page-1#block-img)\n_At dusk_');
    expect(markdown).toContain('[Attachment: minutes.pdf](https://strata.example/notes/page-1#block-att)');
    expect(markdown).toContain('[Example docs](https://example.com/docs)\nHow it works');
    expect(markdown).toContain('[YouTube video](https://www.youtube.com/watch?v=abc)');
    expect(markdown).toContain('See [Budget](https://strata.example/notes/p2) with @Mona');
  });
});
