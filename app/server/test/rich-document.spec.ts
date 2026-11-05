import { describe, expect, it } from 'vitest';
import { withoutTrailingLines } from '../../frontend/src/rich-document';
import { plainDescription } from '../../frontend/src/task-draft';

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (...content: object[]) => ({ type: 'paragraph', ...(content.length ? { content } : {}) });

describe('withoutTrailingLines', () => {
  it('drops empty lines and line breaks after the last words, keeping the ones in between', () => {
    const document = {
      type: 'doc',
      content: [paragraph(text('First')), paragraph(), paragraph(text('Second'), { type: 'hardBreak' }, { type: 'hardBreak' }), paragraph(), paragraph(text('  '), { type: 'hardBreak' })],
    };

    expect(withoutTrailingLines(document)).toEqual({ type: 'doc', content: [paragraph(text('First')), paragraph(), paragraph(text('Second'))] });
  });

  it('leaves a document with nothing in it empty', () => {
    expect(withoutTrailingLines({ type: 'doc', content: [paragraph(), paragraph({ type: 'hardBreak' })] })).toBeNull();
  });

  it('keeps a list or other block that ends the document', () => {
    const list = { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('One'))] }] };
    expect(withoutTrailingLines({ type: 'doc', content: [list, paragraph()] })).toEqual({ type: 'doc', content: [list] });
  });
});

describe('plainDescription', () => {
  it('leaves no empty paragraphs after the last line', () => {
    expect(plainDescription('Buy milk\n\nand bread\n\n')).toEqual({ type: 'doc', content: [paragraph(text('Buy milk')), paragraph(), paragraph(text('and bread'))] });
  });
});
