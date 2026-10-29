import { useEffect, useState } from 'react';
import { IconButton } from '@project-graphite/ui';
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useEditorState, type Editor } from '@tiptap/react';

interface Match {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  current: number;
  matches: Match[];
  decorations: DecorationSet;
}

const maxMatches = 1_000;
const findKey = new PluginKey<FindState>('findInPage');

export function findMatches(doc: ProseMirrorNode, query: string) {
  const found: Match[] = [];
  if (!query) return found;
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  doc.descendants((node, pos) => {
    if (found.length >= maxMatches) return false;
    if (!node.isTextblock) return true;
    for (const match of node.textBetween(0, node.content.size, undefined, '￼').matchAll(pattern)) {
      if (found.length >= maxMatches) break;
      found.push({ from: pos + 1 + match.index, to: pos + 1 + match.index + match[0].length });
    }
    return false;
  });
  return found;
}

function stateOf(doc: ProseMirrorNode, query: string, current: number): FindState {
  const matches = findMatches(doc, query);
  const index = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : 0;
  return {
    query,
    current: index,
    matches,
    decorations: DecorationSet.create(doc, matches.map((match, at) => Decoration.inline(match.from, match.to, { class: at === index ? 'find-match is-current' : 'find-match' }))),
  };
}

export const FindInPage = Extension.create<{ onFind: () => void }>({
  name: 'findInPage',
  addOptions: () => ({ onFind: () => {} }),
  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        this.options.onFind();
        return true;
      },
    };
  },
  addProseMirrorPlugins: () => [
    new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => ({ query: '', current: 0, matches: [], decorations: DecorationSet.empty }),
        apply: (transaction, current) => {
          const wanted = transaction.getMeta(findKey) as { query?: string; current?: number } | undefined;
          if (wanted) return stateOf(transaction.doc, wanted.query ?? current.query, wanted.current ?? current.current);
          return transaction.docChanged && current.query ? stateOf(transaction.doc, current.query, current.current) : current;
        },
      },
      props: {
        decorations: (state) => findKey.getState(state)?.decorations,
      },
    }),
  ],
});

export function FindBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const found = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = findKey.getState(current.state);
      return { count: state?.matches.length ?? 0, current: state?.current ?? 0 };
    },
  });

  useEffect(() => () => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(findKey, { query: '', current: 0 }));
  }, [editor]);

  function show(query: string, index: number) {
    const matches = findMatches(editor.state.doc, query);
    const at = matches.length ? (index + matches.length) % matches.length : 0;
    const transaction = editor.state.tr.setMeta(findKey, { query, current: at });
    const match = matches[at];
    editor.view.dispatch(match ? transaction.setSelection(TextSelection.create(transaction.doc, match.from, match.to)).scrollIntoView() : transaction);
  }

  function close() {
    onClose();
    editor.commands.focus();
  }

  return (
    <div className="note-find" role="search">
      <input
        aria-label="Find in page"
        autoFocus
        className="note-find-input"
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          show(event.currentTarget.value, 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            show(query, found.current + (event.shiftKey ? -1 : 1));
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
        placeholder="Find in page"
        value={query}
      />
      <span aria-live="polite" className="shrink-0 text-small text-muted tabular-nums">
        {found.count ? `${found.current + 1} of ${found.count}` : query ? 'No matches' : ''}
      </span>
      <IconButton disabled={!found.count} icon="chevron-up" label="Previous match" onClick={() => show(query, found.current - 1)} size="small" />
      <IconButton disabled={!found.count} icon="chevron-down" label="Next match" onClick={() => show(query, found.current + 1)} size="small" />
      <IconButton icon="x" label="Close find" onClick={close} size="small" />
    </div>
  );
}
