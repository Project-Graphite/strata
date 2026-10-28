import { Extension, mergeAttributes, Node } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { AttrStep } from '@tiptap/pm/transform';
import { Decoration, DecorationSet, type EditorView, type NodeView, type ViewMutationRecord } from '@tiptap/pm/view';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { createLowlight } from 'lowlight';

export const calloutTints = [
  ['default', 'Plain'],
  ['info', 'Info'],
  ['success', 'Success'],
  ['warning', 'Warning'],
  ['danger', 'Danger'],
] as const;

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes: () => ({
    tint: {
      default: 'default',
      parseHTML: (element: HTMLElement) => calloutTints.find(([tint]) => tint === element.getAttribute('data-tint'))?.[0] ?? 'default',
      renderHTML: (attributes: { tint?: string }) => ({ 'data-tint': attributes.tint }),
    },
  }),
  parseHTML: () => [{ tag: 'div[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'note-callout' }), 0],
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-column]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'note-column' }), 0],
});

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,3}',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-columns]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-columns': '', class: 'note-columns' }), 0],
});

export const columnsOf = (count: number) => ({ type: 'columns', content: Array.from({ length: count }, () => ({ type: 'column', content: [{ type: 'paragraph' }] })) });

export function enterFirstColumn(tr: Transaction) {
  const { $from } = tr.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'columns') {
      tr.setSelection(TextSelection.near(tr.doc.resolve($from.start(depth) + 1)));
      break;
    }
  }
  return true;
}

export function addColumn(tr: Transaction, pos: number, columns: ProseMirrorNode) {
  return tr.insert(pos + columns.nodeSize - 1, columns.type.schema.nodes.column!.createAndFill()!);
}

export function mergeLastColumn(tr: Transaction, pos: number, columns: ProseMirrorNode) {
  const last = columns.lastChild!;
  const start = pos + columns.nodeSize - 1 - last.nodeSize;
  return tr.delete(start, start + last.nodeSize).insert(start - 1, last.content);
}

export function unwrapColumns(tr: Transaction, pos: number, columns: ProseMirrorNode) {
  let content = Fragment.empty;
  columns.forEach((column) => {
    content = content.append(column.content);
  });
  return tr.replaceWith(pos, pos + columns.nodeSize, content);
}

export function changedBlocks(transaction: Transaction) {
  let from = transaction.doc.content.size;
  let to = 0;
  transaction.steps.forEach((step, index) => {
    const after = transaction.mapping.slice(index + 1);
    const widen = (start: number, end: number) => {
      from = Math.min(from, after.map(start, -1));
      to = Math.max(to, after.map(end, 1));
    };
    if (step instanceof AttrStep) widen(step.pos, step.pos + 1);
    step.getMap().forEach((_oldStart, _oldEnd, start, end) => widen(start, end));
  });
  if (from > to) return undefined;
  const $from = transaction.doc.resolve(from);
  const $to = transaction.doc.resolve(to);
  return { from: $from.depth ? $from.before(1) : from, to: $to.depth ? $to.after(1) : to };
}

export const codeLanguages = [
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['json', 'JSON'],
  ['css', 'CSS'],
  ['html', 'HTML'],
  ['bash', 'Bash'],
  ['python', 'Python'],
  ['sql', 'SQL'],
  ['java', 'Java'],
  ['csharp', 'C#'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['yaml', 'YAML'],
  ['markdown', 'Markdown'],
] as const;

const lowlight = createLowlight({ bash, csharp, css, go, java, javascript, json, markdown, python, rust, sql, typescript, xml, yaml });

interface Token {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: Token[];
}

interface Span {
  from: number;
  to: number;
  className: string;
}

function spansOf(tokens: Token[], classes: string[], at: number, found: Span[]): number {
  for (const token of tokens) {
    if (token.type === 'text' && token.value) {
      if (classes.length) found.push({ from: at, to: at + token.value.length, className: classes.join(' ') });
      at += token.value.length;
    } else if (token.children) {
      const own = Array.isArray(token.properties?.className) ? (token.properties.className as string[]) : [];
      at = spansOf(token.children, [...classes, ...own], at, found);
    }
  }
  return at;
}

const highlighted = new WeakMap<ProseMirrorNode, Span[]>();

export function codeSpans(node: ProseMirrorNode) {
  let spans = highlighted.get(node);
  if (spans) return spans;
  const language = node.attrs.language;
  spans = [];
  if (typeof language === 'string' && lowlight.registered(language)) spansOf(lowlight.highlight(language, node.textContent).children as Token[], [], 0, spans);
  highlighted.set(node, spans);
  return spans;
}

function codeMarks(doc: ProseMirrorNode, from: number, to: number) {
  const marks: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'codeBlock') return !node.isTextblock;
    for (const span of codeSpans(node)) marks.push(Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { class: span.className }));
    return false;
  });
  return marks;
}

class CodeBlockView implements NodeView {
  dom = document.createElement('div');
  contentDOM = document.createElement('code');
  private readonly picker = document.createElement('select');

  constructor(private node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) {
    this.dom.className = 'note-code';
    this.picker.className = 'note-code-language';
    this.picker.contentEditable = 'false';
    this.picker.setAttribute('aria-label', 'Code language');
    this.picker.append(new Option('Plain text', ''), ...codeLanguages.map(([value, label]) => new Option(label, value)));
    this.picker.addEventListener('change', () => {
      const pos = getPos();
      if (pos === undefined || !view.editable) return this.show(this.node);
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'language', this.picker.value || null));
    });
    const pre = document.createElement('pre');
    pre.append(this.contentDOM);
    this.dom.append(this.picker, pre);
    this.show(node);
  }

  private show(node: ProseMirrorNode) {
    this.node = node;
    const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
    if (![...this.picker.options].some((option) => option.value === language)) this.picker.append(new Option(language, language));
    this.picker.value = language;
    if (typeof node.attrs.id === 'string') this.dom.dataset.id = node.attrs.id;
    else delete this.dom.dataset.id;
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    this.show(node);
    return true;
  }

  stopEvent(event: Event) {
    return event.target === this.picker;
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target);
  }
}

const codeHighlightKey = new PluginKey<DecorationSet>('codeHighlight');

export const CodeHighlight = Extension.create({
  name: 'codeHighlight',
  addProseMirrorPlugins: () => [
    new Plugin<DecorationSet>({
      key: codeHighlightKey,
      state: {
        init: (_config, state) => DecorationSet.create(state.doc, codeMarks(state.doc, 0, state.doc.content.size)),
        apply: (transaction, current) => {
          if (!transaction.docChanged) return current;
          const decorations = current.map(transaction.mapping, transaction.doc);
          const changed = changedBlocks(transaction);
          if (!changed) return decorations;
          const stale = decorations.find(changed.from, changed.to).filter((mark) => mark.from < changed.to && mark.to > changed.from);
          return decorations.remove(stale).add(transaction.doc, codeMarks(transaction.doc, changed.from, changed.to));
        },
      },
      props: {
        decorations: (state) => codeHighlightKey.getState(state),
        nodeViews: { codeBlock: (node, view, getPos) => new CodeBlockView(node, view, getPos) },
      },
    }),
  ],
});
