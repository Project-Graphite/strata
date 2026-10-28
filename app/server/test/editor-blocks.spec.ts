import { getSchema } from '@tiptap/core';
import { EditorState, type Plugin } from '@tiptap/pm/state';
import type { DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { addColumn, Callout, CodeHighlight, codeSpans, Column, Columns, columnsOf, mergeLastColumn, unwrapColumns } from '../../frontend/src/components/editor-blocks';

const schema = getSchema([StarterKit, Callout, Columns, Column]);
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const columns = (...texts: string[][]) => ({ type: 'columns', content: texts.map((column) => ({ type: 'column', content: column.map(paragraph) })) });
const codeBlock = (language: string | null, text: string) => ({ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] });
const code = (language: string | null, text: string) => schema.nodeFromJSON(codeBlock(language, text));
const doc = (...content: object[]) => schema.nodeFromJSON({ type: 'doc', content });
const [highlighter] = (CodeHighlight.config.addProseMirrorPlugins as () => Plugin<DecorationSet>[])();

describe('callouts', () => {
  it('reads callouts saved before tints existed as the plain tint', () => {
    expect(schema.nodeFromJSON({ type: 'callout', content: [paragraph('Note')] }).attrs.tint).toBe('default');
  });
});

describe('columns', () => {
  it('allows two or three columns only', () => {
    expect(() => schema.nodeFromJSON(columnsOf(2)).check()).not.toThrow();
    expect(() => schema.nodeFromJSON(columnsOf(3)).check()).not.toThrow();
    expect(() => schema.nodeFromJSON(columnsOf(1)).check()).toThrow();
    expect(() => schema.nodeFromJSON(columnsOf(4)).check()).toThrow();
  });

  it('adds a column, merges the last one and unwraps without losing text', () => {
    const state = EditorState.create({ doc: doc(paragraph('Before'), columns(['Left'], ['Right']), paragraph('After')) });
    const node = () => state.doc.child(1);
    const added = addColumn(state.tr, 8, node()).doc;
    expect(added.child(1).childCount).toBe(3);
    expect(added.child(1).lastChild!.textContent).toBe('');

    const three = EditorState.create({ doc: doc(paragraph('Before'), columns(['Left'], ['Middle'], ['Right']), paragraph('After')) });
    const merged = mergeLastColumn(three.tr, 8, three.doc.child(1)).doc;
    merged.check();
    expect(merged.child(1).childCount).toBe(2);
    expect(merged.child(1).lastChild!.textContent).toBe('MiddleRight');

    const unwrapped = unwrapColumns(state.tr, 8, node()).doc;
    unwrapped.check();
    expect(unwrapped.childCount).toBe(4);
    expect(unwrapped.textBetween(0, unwrapped.content.size, '|')).toBe('Before|Left|Right|After');
  });
});

describe('code highlighting', () => {
  it('highlights registered languages and their aliases only', () => {
    expect(codeSpans(code('javascript', 'const total = 1;')).some((span) => span.className === 'hljs-keyword' && span.from === 0 && span.to === 5)).toBe(true);
    expect(codeSpans(code('js', 'return 1')).length).toBeGreaterThan(0);
    expect(codeSpans(code('html', '<p class="x">Hi</p>')).length).toBeGreaterThan(0);
    expect(codeSpans(code(null, 'const total = 1;'))).toEqual([]);
    expect(codeSpans(code('cobol', 'MOVE 1 TO X.'))).toEqual([]);
  });

  it('keeps decorations in step with edits and language changes', () => {
    let state = EditorState.create({ doc: doc(paragraph('Intro'), codeBlock('python', 'def run(): pass')), plugins: [highlighter!] });
    const codeStart = () => state.doc.child(0).nodeSize;
    const marks = () => highlighter!.getState(state)!.find(codeStart(), codeStart() + state.doc.child(1).nodeSize).map((mark) => [mark.from, mark.to]);
    const expected = () => codeSpans(state.doc.child(1)).map((span) => [codeStart() + 1 + span.from, codeStart() + 1 + span.to]);
    expect(marks().length).toBeGreaterThan(0);
    expect(marks()).toEqual(expected());

    state = state.apply(state.tr.insertText('More ', 1));
    expect(marks()).toEqual(expected());

    state = state.apply(state.tr.insertText('async ', codeStart() + 1));
    expect(marks()).toEqual(expected());

    state = state.apply(state.tr.setNodeAttribute(codeStart(), 'language', null));
    expect(marks()).toEqual([]);
  });
});
