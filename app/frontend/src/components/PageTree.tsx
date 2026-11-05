import { createContext, useContext, useEffect, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useLocation, useNavigate } from 'react-router';
import { Icon, useLink, useShell, type IconName } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Reveal } from '../motion';
import { childPagesPath, noteHref, noteTitle, onPagesChanged, type ChildPages, type Note } from '../notes';
import { usePageNavigation } from '../page-navigation';
import { homePath, SpaceMark, spaceHref, useAllSpaces, type Space } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { TextButton } from './Button';
import { CrashBoundary } from './CrashBoundary';
import { NoteMark, NoteTitle } from './NoteMark';
import { SidebarResize } from './SidebarResize';

type Place = 'before' | 'inside' | 'after';
type Move = { parentId: string | null } | { relativeTo: string; placement: 'before' | 'after' };
type Target = { id: string; place: Place; expandable?: boolean };

interface TreeControls {
  open: Set<string>;
  reveal?: { spaceId: string | null; path: string[] };
  dragged?: Note;
  target?: Target;
  busy: boolean;
  toggle(id: string, open?: boolean): void;
  move(note: Note, change: Move): void;
  create(spaceId: string | null, kind: 'note' | 'board'): void;
  drag(note?: Note): void;
  aim(target?: Target): void;
}

const TreeContext = createContext<TreeControls>(null!);
const openKey = 'strata-page-tree-open';
const indentOf = (depth: number) => `${0.75 + Math.min(depth, 5) * 0.875}rem`;

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

function TreeLabel({ children }: { children: ReactNode }) {
  return <span className="min-w-0 flex-1 truncate">{children}</span>;
}

function TreeBranch({ spaceId, parentId, depth, kind = 'note', writable, cursor, searching = true }: { spaceId: string | null; parentId: string | null; depth: number; kind?: 'note' | 'board'; writable: boolean; cursor?: string; searching?: boolean }) {
  const tree = useContext(TreeContext);
  const RowLink = useLink();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const listed = useResource<ChildPages>(childPagesPath(spaceId, parentId, cursor, kind), true, { live: ['page-details', 'pages', 'items', 'spaces'], spaceId: spaceId ?? undefined });
  const reload = listed.reload;
  useEffect(() => onPagesChanged(reload), [reload]);
  const parentIndex = tree.reveal?.path.indexOf(parentId ?? '') ?? -1;
  const wanted = kind === 'note' && tree.reveal?.spaceId === spaceId && (parentId === null || parentIndex >= 0) ? tree.reveal.path[parentIndex + 1] : undefined;
  const seeking = Boolean(searching && wanted && !listed.data?.pages.some((note) => note.id === wanted));
  const indent = indentOf(depth);
  const sortable = writable && kind === 'note';
  const nouns = kind === 'board' ? 'boards' : 'pages';

  return (
    <>
      {(listed.error || listed.refreshError) && <TextButton label={`Retry loading ${nouns}`} onClick={reload} />}
      {listed.loading && (
        <p className="m-0 text-small text-muted" role="status" style={{ paddingLeft: indent }}>
          Loading {nouns}…
        </p>
      )}
      {listed.data?.pages.map((note) => {
        const expanded = tree.open.has(note.id);
        const title = noteTitle(note);
        return (
          <div key={note.id}>
            <div
              className="page-tree-row"
              data-dragging={tree.dragged?.id === note.id || undefined}
              data-drop={tree.target?.id === note.id ? tree.target.place : undefined}
              draggable={sortable}
              onDragEnd={() => {
                tree.drag();
                tree.aim();
              }}
              onDragOver={(event) => {
                if (!sortable || !tree.dragged || tree.dragged.spaceId !== spaceId || tree.dragged.id === note.id) return;
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
                if (sortable && tree.dragged && tree.dragged.id !== note.id && tree.dragged.spaceId === spaceId) {
                  const place = placeFor(event);
                  tree.move(tree.dragged, place === 'inside' ? { parentId: note.id } : { relativeTo: note.id, placement: place });
                }
                tree.drag();
                tree.aim();
              }}
              style={{ paddingLeft: indent, '--drop-indent': indent } as CSSProperties}
            >
              {note.hasChildren && (
                <button aria-expanded={expanded} aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`} className="page-tree-slot page-tree-expand cursor-pointer" onClick={() => tree.toggle(note.id)} type="button">
                  <NoteMark note={note} />
                  <span aria-hidden="true" className="page-tree-chevron">
                    <Icon name="chevron-right" size={16} />
                  </span>
                </button>
              )}
              <RowLink aria-current={pathname === noteHref(note) ? 'page' : undefined} className="page-tree-link" draggable={false} href={noteHref(note)} title={note.draft ? `${title} (draft)` : title}>
                {!note.hasChildren && (
                  <span className="page-tree-slot">
                    <NoteMark note={note} />
                  </span>
                )}
                <TreeLabel>
                  <NoteTitle note={note} />
                </TreeLabel>
              </RowLink>
            </div>
            {note.hasChildren && (
              <Reveal open={expanded}>
                <TreeBranch depth={depth + 1} kind={kind} parentId={note.id} spaceId={spaceId} writable={writable} />
              </Reveal>
            )}
          </div>
        );
      })}
      {listed.data?.pages.length === 0 && !listed.error && (
        <p className="m-0 text-small text-faint" style={{ paddingLeft: indent }}>
          {parentId ? 'No pages inside' : `No ${nouns} yet`}
        </p>
      )}
      {listed.data?.nextCursor &&
        (more || seeking ? (
          <TreeBranch cursor={listed.data.nextCursor} depth={depth} key={listed.data.nextCursor} kind={kind} parentId={parentId} searching={seeking} spaceId={spaceId} writable={writable} />
        ) : (
          <TextButton label={`Load more ${nouns}`} onClick={() => setMore(true)} />
        ))}
    </>
  );
}

function GroupRow({ add, branch, children, depth, href, icon, label }: { add?: { label: string; onAdd: () => void }; branch?: string; children?: ReactNode; depth: number; href: string; icon: IconName; label: string }) {
  const tree = useContext(TreeContext);
  const RowLink = useLink();
  const { pathname } = useLocation();
  const expanded = branch ? tree.open.has(branch) : false;
  return (
    <div>
      <div className="page-tree-row" style={{ paddingLeft: indentOf(depth) }}>
        {branch ? (
          <button aria-expanded={expanded} aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`} className="page-tree-slot page-tree-expand cursor-pointer" onClick={() => tree.toggle(branch)} type="button">
            <Icon name={icon} size={16} />
            <span aria-hidden="true" className="page-tree-chevron">
              <Icon name="chevron-right" size={16} />
            </span>
          </button>
        ) : null}
        <RowLink aria-current={pathname === href ? 'page' : undefined} className="page-tree-link" href={href} title={label}>
          {!branch && (
            <span className="page-tree-slot">
              <Icon name={icon} size={16} />
            </span>
          )}
          <TreeLabel>{label}</TreeLabel>
        </RowLink>
        {add && (
          <button aria-label={add.label} className="page-tree-add enabled:cursor-pointer" disabled={tree.busy} onClick={add.onAdd} title={add.label} type="button">
            <Icon name="plus" size={16} />
          </button>
        )}
      </div>
      {branch && <Reveal open={expanded}>{children}</Reveal>}
    </div>
  );
}

function SpaceBranch({ space }: { space: Space }) {
  const tree = useContext(TreeContext);
  const auth = useAuth();
  const navigate = useNavigate();
  const RowLink = useLink();
  const { pathname } = useLocation();
  const features = auth.user?.features ?? [];
  const branch = `space:${space.id}`;
  const expanded = tree.open.has(branch);
  const writable = space.role !== 'viewer';

  return (
    <div>
      <div className="page-tree-row" style={{ paddingLeft: indentOf(0) }}>
        <button aria-expanded={expanded} aria-label={expanded ? `Collapse ${space.name}` : `Expand ${space.name}`} className="page-tree-slot page-tree-expand cursor-pointer" onClick={() => tree.toggle(branch)} type="button">
          <SpaceMark space={space} />
          <span aria-hidden="true" className="page-tree-chevron">
            <Icon name="chevron-right" size={16} />
          </span>
        </button>
        <RowLink aria-current={pathname === spaceHref(space) ? 'page' : undefined} className="page-tree-link" href={spaceHref(space)} title={space.name}>
          <TreeLabel>{space.name}</TreeLabel>
        </RowLink>
      </div>
      <Reveal open={expanded}>
        {features.includes('pages') && (
          <GroupRow
            add={writable ? { label: `Add a page to ${space.name}`, onAdd: () => tree.create(space.id, 'note') } : undefined}
            branch={`${branch}:pages`}
            depth={1}
            href={spaceHref(space)}
            icon="file"
            label="Pages"
          >
            <TreeBranch depth={2} parentId={null} spaceId={space.id} writable={writable} />
          </GroupRow>
        )}
        {features.includes('boards') && (
          <GroupRow
            add={writable ? { label: `Add a board to ${space.name}`, onAdd: () => tree.create(space.id, 'board') } : undefined}
            branch={`${branch}:boards`}
            depth={1}
            href={spaceHref(space, 'boards')}
            icon="board"
            label="Boards"
          >
            <TreeBranch depth={2} kind="board" parentId={null} spaceId={space.id} writable={writable} />
          </GroupRow>
        )}
        {features.includes('tasks') && (
          <GroupRow
            add={writable ? { label: `Add a task to ${space.name}`, onAdd: () => navigate(`${spaceHref(space, 'tasks')}?new=task`) } : undefined}
            depth={1}
            href={spaceHref(space, 'tasks')}
            icon="check-mark"
            label="Tasks"
          />
        )}
      </Reveal>
    </div>
  );
}

function SidebarTrees() {
  const { collapsed } = useShell();
  const shown = useMediaQuery('(min-width: 48rem)') && !collapsed;
  const auth = useAuth();
  const RowLink = useLink();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [currentPage] = usePageNavigation();
  const spaces = useAllSpaces();
  const action = useAction();
  const [open, setOpen] = useState(readOpen);
  const [dragged, setDragged] = useState<Note>();
  const [target, setTarget] = useState<Target>();
  const pagesOn = auth.user?.features.includes('pages');
  const reveal =
    currentPage && pathname === noteHref(currentPage) && !currentPage.quick && !currentPage.template
      ? { spaceId: currentPage.spaceId, path: [...currentPage.path.map((page) => page.id), currentPage.id] }
      : undefined;
  const revealKey = reveal ? `${reveal.spaceId ?? ''}|${currentPage!.kind}|${reveal.path.join('|')}` : '';

  useEffect(() => {
    if (!revealKey) return;
    const [spaceId, kind, ...path] = revealKey.split('|');
    const groups = spaceId ? [`space:${spaceId}`, `space:${spaceId}:${kind === 'board' ? 'boards' : 'pages'}`] : [];
    setOpen((current) => new Set([...current, ...groups, ...path.slice(0, -1)]));
  }, [revealKey]);

  useEffect(() => {
    if (!target?.expandable || target.place !== 'inside') return;
    const timer = window.setTimeout(() => toggle(target.id, true), 700);
    return () => window.clearTimeout(timer);
  }, [target]);

  function toggle(id: string, opened?: boolean) {
    setOpen((current) => {
      const next = new Set(current);
      if (opened ?? !next.has(id)) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(openKey, JSON.stringify([...next]));
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
      }
      return next;
    });
  }

  const tree: TreeControls = {
    open,
    reveal,
    dragged,
    target,
    busy: action.busy,
    toggle,
    drag: setDragged,
    aim: (next) => setTarget((current) => (current?.id === next?.id && current?.place === next?.place ? current : next)),
    move: (note, change) => {
      if (action.busy) return;
      void action.run(async () => {
        const saved = await auth.request<Note>(`/notes/${note.id}`, { method: 'PATCH', body: JSON.stringify(change) });
        if (saved.parentId) toggle(saved.parentId, true);
        return '';
      }, 'Could not move the page');
    },
    create: (spaceId, kind) =>
      void action.run(async () => {
        const created = await auth.request<Note>(homePath(spaceId, 'notes'), { method: 'POST', body: JSON.stringify(kind === 'board' ? { board: true } : {}) });
        if (spaceId) toggle(`space:${spaceId}:${kind === 'board' ? 'boards' : 'pages'}`, true);
        navigate(noteHref(created));
        return '';
      }, kind === 'board' ? 'Could not add the board' : 'Could not add the page'),
  };

  return (
    <TreeContext.Provider value={tree}>
      <div className="sidebar-trees" hidden={collapsed}>
        <section aria-label="Spaces" className="page-tree">
          <div className="page-tree-head">
            <p className="sidebar-section-label">Spaces</p>
            <RowLink aria-current={pathname === '/spaces' ? 'page' : undefined} aria-label="All spaces" className="page-tree-add" href="/spaces" title="All spaces">
              <Icon name="folder" size={16} />
            </RowLink>
          </div>
          {shown && spaces.data?.filter((space) => !space.archived).map((space) => <SpaceBranch key={space.id} space={space} />)}
        </section>
        {pagesOn && (
          <section aria-label="Your pages" className="page-tree">
            <div
              className="page-tree-head"
              data-drop={target?.id === 'root' ? 'inside' : undefined}
              onDragOver={(event) => {
                if (dragged && dragged.spaceId === null) {
                  event.preventDefault();
                  tree.aim({ id: 'root', place: 'inside' });
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged && dragged.spaceId === null) tree.move(dragged, { parentId: null });
                setDragged(undefined);
                setTarget(undefined);
              }}
            >
              <p className="sidebar-section-label">Pages</p>
              <button aria-label="Add a page" className="page-tree-add enabled:cursor-pointer" disabled={action.busy} onClick={() => tree.create(null, 'note')} title="Add a page" type="button">
                <Icon name="plus" size={16} />
              </button>
            </div>
            {shown && <TreeBranch depth={0} parentId={null} spaceId={null} writable />}
          </section>
        )}
      </div>
      {!collapsed && <SidebarResize />}
    </TreeContext.Provider>
  );
}

export function PageTree() {
  return (
    <CrashBoundary compact label="The sidebar tree">
      <SidebarTrees />
    </CrashBoundary>
  );
}
