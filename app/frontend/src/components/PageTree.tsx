import { useEffect, useState, type DragEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useShell } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { noteTitle, onPagesChanged, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

type Place = 'before' | 'inside' | 'after';

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

export function PageTree() {
  const { collapsed } = useShell();
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const spaces = useSpaces();
  const listed = useResource<Note[]>(collapsed ? null : '/me/notes', true);
  const action = useAction();
  const [open, setOpen] = useState(readOpen);
  const [dragged, setDragged] = useState<Note>();
  const [target, setTarget] = useState<{ id: string; place: Place }>();
  const reload = listed.reload;

  useEffect(() => {
    reload();
  }, [pathname, reload]);

  useEffect(() => onPagesChanged(reload), [reload]);

  if (collapsed || !listed.data || !spaces.data) return null;
  const pages = listed.data.filter((note) => !note.template);
  const known = new Set(pages.map((note) => note.id));
  const childrenOf = (spaceId: string, parentId: string | null) =>
    pages
      .filter((note) => note.spaceId === spaceId && (note.parentId && known.has(note.parentId) ? note.parentId : null) === parentId)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));

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

  function addInside(spaceId: string, parentId: string | null) {
    void action.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify(parentId ? { parentId } : {}) });
      if (parentId && !open.has(parentId)) toggle(parentId);
      reload();
      navigate(`/notes/${created.id}`);
      return '';
    }, 'Could not add the page');
  }

  function drop(note: Note, onto: Note | null, place: Place, spaceId: string) {
    setDragged(undefined);
    setTarget(undefined);
    if (note.spaceId !== spaceId || note.id === onto?.id) return;
    let change: { parentId: string | null; position?: number };
    if (!onto || place === 'inside') {
      change = { parentId: onto?.id ?? null };
    } else {
      const siblings = childrenOf(spaceId, onto.parentId).filter((sibling) => sibling.id !== note.id);
      const neighbour = siblings[siblings.indexOf(onto) + (place === 'before' ? -1 : 1)];
      change = {
        parentId: onto.parentId,
        position: neighbour ? (onto.position + neighbour.position) / 2 : onto.position + (place === 'before' ? -1 : 1),
      };
    }
    void action.run(async () => {
      await auth.request(`/notes/${note.id}`, { method: 'PATCH', body: JSON.stringify(change) });
      if (change.parentId && !open.has(change.parentId)) toggle(change.parentId);
      reload();
      return '';
    }, 'Could not move the page');
  }

  function branch(spaceId: string, parentId: string | null, depth: number) {
    return childrenOf(spaceId, parentId).map((note) => {
      const nested = childrenOf(spaceId, note.id);
      const expanded = open.has(note.id);
      const nests = note.kind !== 'board';
      return (
        <div key={note.id}>
          <div
            className="page-tree-row"
            data-drop={target?.id === note.id ? target.place : undefined}
            draggable
            onDragEnd={() => {
              setDragged(undefined);
              setTarget(undefined);
            }}
            onDragOver={(event) => {
              if (!dragged || dragged.spaceId !== spaceId) return;
              event.preventDefault();
              const place = placeFor(event, nests);
              setTarget((current) => (current?.id === note.id && current.place === place ? current : { id: note.id, place }));
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', note.id);
              setDragged(note);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged) drop(dragged, note, placeFor(event, nests), spaceId);
            }}
            style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
          >
            <button
              aria-label={expanded ? `Collapse ${noteTitle(note)}` : `Expand ${noteTitle(note)}`}
              className="page-tree-toggle"
              disabled={nested.length === 0}
              onClick={() => toggle(note.id)}
              type="button"
            >
              {nested.length > 0 ? (expanded ? '▾' : '▸') : ''}
            </button>
            <Link aria-current={pathname === `/notes/${note.id}` ? 'page' : undefined} className="page-tree-link" draggable={false} to={`/notes/${note.id}`}>
              <span aria-hidden="true">{note.icon ?? (note.kind === 'board' ? '▦' : '·')}</span>
              <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
            </Link>
            {nests && (
              <button aria-label={`Add a page inside ${noteTitle(note)}`} className="page-tree-add" disabled={action.busy} onClick={() => addInside(spaceId, note.id)} type="button">
                +
              </button>
            )}
          </div>
          {expanded && branch(spaceId, note.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <section aria-label="Page tree" className="page-tree">
      <p className="sidebar-section-label">Pages</p>
      {spaces.data.map((space) => {
        const key = `space:${space.id}`;
        const expanded = open.has(key);
        const writable = space.role !== 'viewer';
        return (
          <div key={space.id}>
            <div
              className="page-tree-row"
              data-drop={target?.id === key ? 'inside' : undefined}
              onDragOver={(event) => {
                if (!dragged || dragged.spaceId !== space.id) return;
                event.preventDefault();
                setTarget({ id: key, place: 'inside' });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged) drop(dragged, null, 'inside', space.id);
              }}
            >
              <button aria-label={expanded ? `Collapse ${space.name}` : `Expand ${space.name}`} className="page-tree-toggle" onClick={() => toggle(key)} type="button">
                {expanded ? '▾' : '▸'}
              </button>
              <button className="page-tree-link" onClick={() => toggle(key)} type="button">
                <span className="min-w-0 flex-1 truncate text-left">{space.name}</span>
              </button>
              {writable && (
                <button aria-label={`Add a page to ${space.name}`} className="page-tree-add" disabled={action.busy} onClick={() => addInside(space.id, null)} type="button">
                  +
                </button>
              )}
            </div>
            {expanded && branch(space.id, null, 1)}
          </div>
        );
      })}
    </section>
  );
}
