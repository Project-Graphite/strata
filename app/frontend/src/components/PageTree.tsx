import { createContext, useContext, useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Link, useLocation, useNavigate } from 'react-router';
import { Icon, useShell } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Reveal } from '../motion';
import { childPagesPath, noteHref, noteTitle, onPagesChanged, pageHref, type ChildPages, type Note } from '../notes';
import { usePageNavigation } from '../page-navigation';
import { useChosenSpace } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { TextButton } from './Button';
import { NoteMark } from './NoteMark';

type Place = 'before' | 'inside' | 'after';
type Move = { parentId: string | null } | { relativeTo: string; placement: 'before' | 'after' };
type Target = { id: string; place: Place; expandable?: boolean };

interface TreeControls {
  open: Set<string>;
  reveal?: { spaceId: string; path: string[] };
  dragged?: Note;
  target?: Target;
  toggle(id: string): void;
  move(note: Note, change: Move): void;
  drag(note?: Note): void;
  aim(target?: Target): void;
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

function placeFor(event: DragEvent<HTMLElement>): Place {
  const box = event.currentTarget.getBoundingClientRect();
  const share = (event.clientY - box.top) / box.height;
  if (share < 0.25) return 'before';
  if (share > 0.75) return 'after';
  return 'inside';
}

function TreeBranch({ spaceId, parentId, depth, writable, cursor, searching = true }: { spaceId: string; parentId: string | null; depth: number; writable: boolean; cursor?: string; searching?: boolean }) {
  const tree = useContext(TreeContext);
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const listed = useResource<ChildPages>(childPagesPath(spaceId, parentId, cursor, 'note'), true, { live: ['page-details', 'items', 'spaces'], spaceId });
  const reload = listed.reload;
  useEffect(() => onPagesChanged(reload), [reload]);
  const parentIndex = tree.reveal?.path.indexOf(parentId ?? '') ?? -1;
  const wanted = tree.reveal?.spaceId === spaceId && (parentId === null || parentIndex >= 0)
    ? tree.reveal.path[parentIndex + 1]
    : undefined;
  const seeking = Boolean(searching && wanted && !listed.data?.pages.some((note) => note.id === wanted));
  const indent = `${0.75 + Math.min(depth, 4) * 0.875}rem`;

  return (
    <>
      {(listed.error || listed.refreshError) && <TextButton label="Retry loading pages" onClick={reload} />}
      {listed.loading && <p className="m-0 px-4 text-small text-muted" role="status">Loading pages…</p>}
      {listed.data?.pages.map((note) => {
        const expanded = tree.open.has(note.id);
        const title = noteTitle(note);
        return (
          <div key={note.id}>
            <div className="page-tree-row" data-dragging={tree.dragged?.id === note.id || undefined} data-drop={tree.target?.id === note.id ? tree.target.place : undefined} draggable={writable}
              onDragEnd={() => { tree.drag(); tree.aim(); }}
              onDragOver={(event) => {
                if (!tree.dragged || tree.dragged.spaceId !== spaceId || tree.dragged.id === note.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                tree.aim({ id: note.id, place: placeFor(event), expandable: note.hasChildren && !expanded });
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', note.id);
                tree.drag(note);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (tree.dragged && tree.dragged.id !== note.id && tree.dragged.spaceId === spaceId) {
                  const place = placeFor(event);
                  tree.move(tree.dragged, place === 'inside' ? { parentId: note.id } : { relativeTo: note.id, placement: place });
                }
                tree.drag(); tree.aim();
              }} style={{ paddingLeft: indent, '--drop-indent': indent } as CSSProperties}>
              {note.hasChildren && (
                <button aria-expanded={expanded} aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`} className="page-tree-slot page-tree-expand cursor-pointer" onClick={() => tree.toggle(note.id)} type="button">
                  <NoteMark note={note} />
                  <span aria-hidden="true" className="page-tree-chevron"><Icon name="chevron-right" size={16} /></span>
                </button>
              )}
              <Link aria-current={pathname === noteHref(note) ? 'page' : undefined} className="page-tree-link" draggable={false} title={title} to={noteHref(note)}>
                {!note.hasChildren && <span className="page-tree-slot"><NoteMark note={note} /></span>}
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </Link>
            </div>
            {note.hasChildren && (
              <Reveal open={expanded}>
                <TreeBranch depth={depth + 1} parentId={note.id} spaceId={spaceId} writable={writable} />
              </Reveal>
            )}
          </div>
        );
      })}
      {listed.data?.pages.length === 0 && !listed.error && <p className="m-0 px-4 text-small text-muted">No pages inside</p>}
      {listed.data?.nextCursor && (more || seeking
        ? <TreeBranch cursor={listed.data.nextCursor} depth={depth} key={listed.data.nextCursor} parentId={parentId} searching={seeking} spaceId={spaceId} writable={writable} />
        : <TextButton label="Load more pages" onClick={() => setMore(true)} />)}
    </>
  );
}

export function PageTree() {
  const { collapsed } = useShell();
  const shown = useMediaQuery('(min-width: 48rem)') && !collapsed;
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [currentPage] = usePageNavigation();
  const { space, editable: writable } = useChosenSpace();
  const action = useAction();
  const [open, setOpen] = useState(readOpen);
  const [dragged, setDragged] = useState<Note>();
  const [target, setTarget] = useState<Target>();
  const reveal = currentPage?.spaceId && pathname === noteHref(currentPage) && !currentPage.quick && !currentPage.template
    ? { spaceId: currentPage.spaceId, path: [...currentPage.path.map((page) => page.id), currentPage.id] }
    : undefined;
  const revealKey = reveal ? `${reveal.spaceId}|${reveal.path.join('|')}` : '';
  useEffect(() => {
    if (!revealKey) return;
    const [, ...path] = revealKey.split('|');
    setOpen((current) => new Set([...current, ...path.slice(0, -1)]));
  }, [revealKey]);

  useEffect(() => {
    if (!target?.expandable || target.place !== 'inside') return;
    const timer = window.setTimeout(() => toggle(target.id), 700);
    return () => window.clearTimeout(timer);
  }, [target]);

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
    open, reveal, dragged, target, toggle, drag: setDragged,
    aim: (next) => setTarget((current) => (current?.id === next?.id && current?.place === next?.place ? current : next)),
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
        <div className="page-tree-head" data-drop={target?.id === 'root' ? 'inside' : undefined}
          onDragOver={(event) => { if (space && dragged?.spaceId === space.id) { event.preventDefault(); tree.aim({ id: 'root', place: 'inside' }); } }}
          onDrop={(event) => { event.preventDefault(); if (space && dragged?.spaceId === space.id) tree.move(dragged, { parentId: null }); setDragged(undefined); setTarget(undefined); }}>
          <p className="sidebar-section-label">Pages</p>
          {space && writable && <button aria-label={`Add a page to ${space.name}`} className="page-tree-add enabled:cursor-pointer" disabled={action.busy} onClick={() => void action.run(async () => {
            navigate(pageHref((await auth.request<Note>(`/spaces/${space.id}/notes`, { method: 'POST', body: '{}' })).id));
            return '';
          }, 'Could not add the page')} type="button"><Icon name="plus" size={16} /></button>}
        </div>
        {space && shown && <TreeBranch depth={0} key={space.id} parentId={null} spaceId={space.id} writable={writable} />}
      </section>
    </TreeContext.Provider>
  );
}
