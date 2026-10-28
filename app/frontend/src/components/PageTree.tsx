import { createContext, useContext, useEffect, useState, type DragEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Icon, useShell, type MenuItem } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { noteTitle, onPagesChanged, type Note } from '../notes';
import { usePageNavigation } from '../page-navigation';
import { SpaceMark, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ActionsMenu } from './ActionsMenu';
import { TextButton } from './Button';
import { NoteMark } from './NoteMark';

type Place = 'before' | 'inside' | 'after';
type Move = { parentId: string | null } | { relativeTo: string; placement: 'before' | 'after' };

interface TreeControls {
  open: Set<string>;
  reveal?: { spaceId: string; path: string[] };
  busy: boolean;
  dragged?: Note;
  target?: { id: string; place: Place };
  toggle(id: string): void;
  add(spaceId: string, parentId: string | null): void;
  move(note: Note, change: Move): void;
  drag(note?: Note): void;
  aim(target?: { id: string; place: Place }): void;
}

const TreeContext = createContext<TreeControls>(null!);
const openKey = 'strata-page-tree-open';

function readOpen() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(openKey) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
}

function placeFor(event: DragEvent<HTMLElement>, nests: boolean): Place {
  const box = event.currentTarget.getBoundingClientRect();
  const share = (event.clientY - box.top) / box.height;
  if (share < 0.3) return 'before';
  if (share > 0.7 || !nests) return 'after';
  return 'inside';
}

function TreeBranch({ spaceId, parentId, depth, writable, cursor, preceding, searching = true }: { spaceId: string; parentId: string | null; depth: number; writable: boolean; cursor?: string; preceding?: Note; searching?: boolean }) {
  const tree = useContext(TreeContext);
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const listed = useResource<{ pages: Note[]; nextCursor: string | null; nextPage: Note | null }>(
    `/spaces/${spaceId}/page-children?${new URLSearchParams({ ...(parentId ? { parentId } : {}), ...(cursor ? { cursor } : {}) })}`,
    true, { live: ['page-details', 'items', 'spaces'], spaceId },
  );
  const reload = listed.reload;
  useEffect(() => onPagesChanged(reload), [reload]);
  const parentIndex = tree.reveal?.path.indexOf(parentId ?? '') ?? -1;
  const wanted = tree.reveal?.spaceId === spaceId && (parentId === null || parentIndex >= 0)
    ? tree.reveal.path[parentIndex + 1]
    : undefined;
  const seeking = Boolean(searching && wanted && !listed.data?.pages.some((note) => note.id === wanted));

  return (
    <>
      {(listed.error || listed.refreshError) && <TextButton label="Retry loading pages" onClick={reload} />}
      {listed.loading && <p className="mono-sm px-4 text-faint" role="status">Loading pages…</p>}
      {listed.data?.pages.map((note, index, pages) => {
        const expanded = tree.open.has(note.id);
        const nests = note.kind !== 'board';
        const previous = pages[index - 1] ?? preceding;
        const next = pages[index + 1] ?? listed.data?.nextPage;
        const actions: MenuItem[] = [
          ...(nests ? [{ label: 'Add page inside', onSelect: () => tree.add(spaceId, note.id) }] : []),
          ...(previous ? [{ label: 'Move up', onSelect: () => tree.move(note, { relativeTo: previous.id, placement: 'before' }) }] : []),
          ...(next ? [{ label: 'Move down', onSelect: () => tree.move(note, { relativeTo: next.id, placement: 'after' }) }] : []),
          ...(previous?.kind === 'note' ? [{ label: `Move inside ${noteTitle(previous)}`, onSelect: () => tree.move(note, { parentId: previous.id }) }] : []),
          ...(note.parentId ? [{ label: 'Move to space root', onSelect: () => tree.move(note, { parentId: null }) }] : []),
        ];
        return (
          <div key={note.id}>
            <div className="page-tree-row" data-drop={tree.target?.id === note.id ? tree.target.place : undefined} draggable={writable}
              onDragEnd={() => { tree.drag(); tree.aim(); }}
              onDragOver={(event) => {
                if (!tree.dragged || tree.dragged.spaceId !== spaceId) return;
                event.preventDefault();
                tree.aim({ id: note.id, place: placeFor(event, nests) });
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', note.id);
                tree.drag(note);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (tree.dragged && tree.dragged.id !== note.id && tree.dragged.spaceId === spaceId) {
                  const place = placeFor(event, nests);
                  tree.move(tree.dragged, place === 'inside' ? { parentId: note.id } : { relativeTo: note.id, placement: place });
                }
                tree.drag(); tree.aim();
              }} style={{ paddingLeft: `${0.5 + Math.min(depth, 3) * 0.6}rem` }}>
              <button aria-expanded={nests ? expanded : undefined} aria-label={expanded ? `Collapse ${noteTitle(note)}` : `Expand ${noteTitle(note)}`} className="page-tree-toggle enabled:cursor-pointer" disabled={!nests} onClick={() => tree.toggle(note.id)} type="button">
                {nests && <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />}
              </button>
              <Link aria-current={pathname === `/notes/${note.id}` ? 'page' : undefined} className="page-tree-link" draggable={false} title={noteTitle(note)} to={`/notes/${note.id}`}>
                <NoteMark note={note} /><span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
              </Link>
              {writable && actions.length > 0 && <ActionsMenu name={noteTitle(note)} items={actions} />}
            </div>
            {nests && expanded && <TreeBranch depth={depth + 1} parentId={note.id} spaceId={spaceId} writable={writable} />}
          </div>
        );
      })}
      {listed.data?.pages.length === 0 && !listed.error && <p className="mono-sm px-4 text-faint">No pages inside</p>}
      {listed.data?.nextCursor && (more || seeking
        ? <TreeBranch cursor={listed.data.nextCursor} depth={depth} key={listed.data.nextCursor} parentId={parentId} preceding={listed.data.pages.at(-1)} searching={seeking} spaceId={spaceId} writable={writable} />
        : <TextButton label="Load more pages" onClick={() => setMore(true)} />)}
    </>
  );
}

export function PageTree() {
  const { collapsed } = useShell();
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [currentPage] = usePageNavigation();
  const spaces = useSpaces();
  const action = useAction();
  const [open, setOpen] = useState(readOpen);
  const [dragged, setDragged] = useState<Note>();
  const [target, setTarget] = useState<{ id: string; place: Place }>();
  const reveal = currentPage && pathname === `/notes/${currentPage.id}` && !currentPage.quick && !currentPage.template
    ? { spaceId: currentPage.spaceId, path: [...currentPage.path.map((page) => page.id), currentPage.id] }
    : undefined;
  const revealKey = reveal ? `${reveal.spaceId}|${reveal.path.join('|')}` : '';
  useEffect(() => {
    if (!revealKey) return;
    const [spaceId, ...path] = revealKey.split('|');
    setOpen((current) => new Set([...current, `space:${spaceId}`, ...path.slice(0, -1)]));
  }, [revealKey]);

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      try {
        localStorage.setItem(openKey, JSON.stringify([...next]));
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
      }
      return next;
    });
  }

  const tree: TreeControls = {
    open, reveal, busy: action.busy, dragged, target, toggle, drag: setDragged, aim: setTarget,
    add: (spaceId, parentId) => {
      void action.run(async () => {
        const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify(parentId ? { parentId } : {}) });
        if (parentId && !open.has(parentId)) toggle(parentId);
        navigate(`/notes/${created.id}`);
        return '';
      }, 'Could not add the page');
    },
    move: (note, change) => {
      if (action.busy) return;
      void action.run(async () => {
        const saved = await auth.request<Note>(`/notes/${note.id}`, { method: 'PATCH', body: JSON.stringify(change) });
        if (saved.parentId && !open.has(saved.parentId)) toggle(saved.parentId);
        return '';
      }, 'Could not move the page');
    },
  };

  return (
    <TreeContext.Provider value={tree}>
      <section aria-label="Page tree" className="page-tree" hidden={collapsed}>
        <p className="sidebar-section-label">Pages</p>
        {spaces.data?.map((space) => {
          const key = `space:${space.id}`;
          const expanded = open.has(key);
          const writable = space.role !== 'viewer';
          return (
            <div key={space.id}>
              <div className="page-tree-row" data-drop={target?.id === key ? 'inside' : undefined}
                onDragOver={(event) => { if (dragged?.spaceId === space.id) { event.preventDefault(); setTarget({ id: key, place: 'inside' }); } }}
                onDrop={(event) => { event.preventDefault(); if (dragged?.spaceId === space.id) tree.move(dragged, { parentId: null }); setDragged(undefined); setTarget(undefined); }}>
                <button aria-expanded={expanded} aria-label={expanded ? `Collapse ${space.name}` : `Expand ${space.name}`} className="page-tree-toggle cursor-pointer" onClick={() => toggle(key)} type="button"><Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} /></button>
                <button className="page-tree-link cursor-pointer justify-start" onClick={() => toggle(key)} title={space.name} type="button"><SpaceMark space={space} /><span className="min-w-0 flex-1 truncate text-left">{space.name}</span></button>
                {writable && <button aria-label={`Add a page to ${space.name}`} className="page-tree-add enabled:cursor-pointer" disabled={action.busy} onClick={() => tree.add(space.id, null)} type="button"><Icon name="plus" size={14} /></button>}
              </div>
              {expanded && <TreeBranch depth={1} parentId={null} spaceId={space.id} writable={writable} />}
            </div>
          );
        })}
      </section>
    </TreeContext.Provider>
  );
}
