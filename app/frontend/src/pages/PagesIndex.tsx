import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon, IconButton, Placeholder, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, TextButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { ImportPages } from '../components/ImportPages';
import { LoadError } from '../components/LoadError';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { NoteMark } from '../components/NoteMark';
import { Page } from '../components/Page';
import { RowText } from '../components/RowText';
import { ButtonSkeleton, IconSkeleton, RowsSkeleton, useRememberedShape } from '../components/Skeletons';
import { announcePagesChanged, childPagesPath, nestedUnder, noteHref, noteTitle, onPagesChanged, pageIndent, pagesTabs, type ChildPages, type Note, type PagesSection } from '../notes';
import { SpaceMark, useSpaces } from '../spaces';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const emptyStates = {
  pages: { title: 'No pages yet', hint: 'Pages hold notes, checklists, tables and anything else you write.' },
  'quick-notes': { title: 'No quick notes yet', hint: 'Quick notes are for one-off jots. Write one here or from Home.' },
  journal: { title: 'No journal entries yet', hint: 'The pages you write from the Journal show up here.' },
};

const edited = (note: Note) => `Edited ${formatMoment(note.updatedAt)}`;

interface PagesTreeControls {
  open: Set<string>;
  toggle: (id: string) => void;
  trash: (note: Note) => void;
}

const PagesTreeContext = createContext<PagesTreeControls>(null!);

function CreateButton({ busy, label, onCreate, primary = false, spaceId }: { busy: boolean; label: string; onCreate: (spaceId: string) => void; primary?: boolean; spaceId: string }) {
  return <Button disabled={busy} icon="plus" label={label} onClick={() => onCreate(spaceId)} primary={primary} />;
}

function TreeNote({ children, depth }: { children: ReactNode; depth: number }) {
  return (
    <li className="pages-tree-note" role="none" style={pageIndent(depth + 1)}>
      {children}
    </li>
  );
}

function TreeLevel({ cursor, depth, parentId, spaceId, writable }: { cursor?: string; depth: number; parentId: string | null; spaceId: string; writable: boolean }) {
  const tree = useContext(PagesTreeContext);
  const [more, setMore] = useState(false);
  const listed = useResource<ChildPages>(childPagesPath(spaceId, parentId, cursor), true, { live: ['page-details', 'items', 'spaces'], spaceId });
  const reload = listed.reload;
  useEffect(() => onPagesChanged(reload), [reload]);
  const pages = listed.data?.pages.filter((page) => page.kind === 'note' && !page.journal) ?? [];

  return (
    <>
      {listed.error && (
        <TreeNote depth={depth}>
          <LoadError compact error={listed.error} onRetry={reload} />
        </TreeNote>
      )}
      {!listed.data && !listed.error && <TreeNote depth={depth}>Loading pages…</TreeNote>}
      {listed.data && pages.length === 0 && !cursor && !listed.data.nextCursor && <TreeNote depth={depth}>{parentId ? 'No pages inside' : 'No pages in this space yet'}</TreeNote>}
      {pages.map((page) => {
        const expanded = tree.open.has(page.id);
        return (
          <li aria-expanded={expanded} aria-label={`${noteTitle(page)}, ${edited(page).toLowerCase()}`} aria-level={depth + 1} data-href={noteHref(page)} data-tree-id={page.id} key={page.id} role="treeitem" tabIndex={-1}>
            <div className="pages-tree-row" style={pageIndent(depth)}>
              <button aria-hidden="true" className="page-tree-toggle cursor-pointer" onClick={() => tree.toggle(page.id)} tabIndex={-1} type="button">
                <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
              </button>
              <Link className="flex min-w-0 flex-1 items-center gap-3 py-2 text-ink no-underline" tabIndex={-1} to={noteHref(page)}>
                <NoteMark note={page} />
                <RowText detail={edited(page)} title={noteTitle(page)} />
              </Link>
              {writable && <ActionsMenu items={[{ label: 'Move to trash', onSelect: () => tree.trash(page) }]} name={noteTitle(page)} />}
            </div>
            {expanded && (
              <ul role="group">
                <TreeLevel depth={depth + 1} parentId={page.id} spaceId={spaceId} writable={writable} />
              </ul>
            )}
          </li>
        );
      })}
      {listed.data?.nextCursor &&
        (more ? (
          <TreeLevel cursor={listed.data.nextCursor} depth={depth} parentId={parentId} spaceId={spaceId} writable={writable} />
        ) : (
          <TreeNote depth={depth}>
            <TextButton label="Load more pages" onClick={() => setMore(true)} />
          </TreeNote>
        ))}
    </>
  );
}

function PagesTree() {
  const spaces = useSpaces();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => new Set<string>());
  const [inside, setInside] = useState(false);
  const last = useRef<HTMLElement>(null);
  const moveToTrash = useMovePageToTrash(announcePagesChanged, announcePagesChanged);

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function navigateTree(event: KeyboardEvent<HTMLUListElement>) {
    const item = event.target as HTMLElement;
    if (item.getAttribute('role') !== 'treeitem') return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const index = items.indexOf(item);
    const id = item.dataset.treeId!;
    const expanded = item.getAttribute('aria-expanded') === 'true';
    const parentOf = (candidate?: HTMLElement) => candidate?.parentElement?.closest<HTMLElement>('[role="treeitem"]');
    const focus = (target?: HTMLElement | null) => {
      event.preventDefault();
      target?.focus();
    };
    if (event.key === 'ArrowDown') focus(items[index + 1]);
    else if (event.key === 'ArrowUp') focus(items[index - 1]);
    else if (event.key === 'Home') focus(items[0]);
    else if (event.key === 'End') focus(items.at(-1));
    else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!expanded) toggle(id);
      else if (parentOf(items[index + 1]) === item) items[index + 1]!.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (expanded) toggle(id);
      else parentOf(item)?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (item.dataset.href) navigate(item.dataset.href);
      else toggle(id);
    }
  }

  if (!spaces.data) return <RowsSkeleton lead={<IconSkeleton />} rows={4} />;
  return (
    <PagesTreeContext value={{ open, toggle, trash: (note) => moveToTrash(note, 0) }}>
      <ul
        aria-label="Pages by space"
        className="pages-tree"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setInside(false);
        }}
        onFocus={(event) => {
          setInside(true);
          if (event.target.getAttribute('role') === 'treeitem') last.current = event.target;
          if (event.target !== event.currentTarget) return;
          (last.current?.isConnected ? last.current : event.currentTarget.querySelector<HTMLElement>('[role="treeitem"]'))?.focus();
        }}
        onKeyDown={navigateTree}
        role="tree"
        tabIndex={inside ? -1 : 0}
      >
        {spaces.data.map((space) => {
          const key = `space:${space.id}`;
          const expanded = !open.has(key);
          return (
            <li aria-expanded={expanded} aria-label={space.name} aria-level={1} data-tree-id={key} key={space.id} role="treeitem" tabIndex={-1}>
              <div className="pages-tree-row" style={pageIndent(0)}>
                <button aria-hidden="true" className="page-tree-toggle cursor-pointer" onClick={() => toggle(key)} tabIndex={-1} type="button">
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
                </button>
                <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 text-left font-medium text-ink" onClick={() => toggle(key)} tabIndex={-1} type="button">
                  <SpaceMark space={space} />
                  <span className="min-w-0 truncate">{space.name}</span>
                </button>
              </div>
              {expanded && (
                <ul role="group">
                  <TreeLevel depth={1} parentId={null} spaceId={space.id} writable={space.role !== 'viewer'} />
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </PagesTreeContext>
  );
}

function PageSearch({ query }: { query: string }) {
  const spaces = useSpaces();
  const listed = useResource<Note[]>('/me/notes?kind=note', true, { live: ['page-details', 'pages', 'items', 'spaces'] });
  const spaceNames = new Map(spaces.data?.map((space) => [space.id, space.name]));
  const text = query.trim().toLocaleLowerCase();
  const found = listed.data?.filter((note) => !note.journal && noteTitle(note).toLocaleLowerCase().includes(text)) ?? [];
  if (listed.error) return <LoadError error={listed.error} onRetry={listed.reload} />;
  if (!listed.data) return <RowsSkeleton lead={<IconSkeleton />} rows={3} />;
  if (found.length === 0) return <Empty title="No pages match">Try another word from the page title.</Empty>;
  return (
    <ul aria-label="Matching pages" className="panel-rows">
      {found.map((note) => (
        <li key={note.id}>
          <Link className="flex min-w-0 items-center gap-3 panel-row text-ink no-underline hover:bg-line-soft" to={noteHref(note)}>
            <NoteMark note={note} />
            <RowText detail={[spaceNames.get(note.spaceId), edited(note)].filter(Boolean).join(' · ')} title={noteTitle(note)} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NoteList({ section }: { section: Exclude<PagesSection, 'pages'> }) {
  const spaces = useSpaces();
  const listed = useResource<Note[]>(`/me/notes?kind=${section === 'quick-notes' ? 'quick' : 'note'}`, true, { live: ['page-details', 'pages', 'items', 'spaces'] });
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const spaceNames = new Map(spaces.data?.map((space) => [space.id, space.name]));
  const pages = listed.data?.filter((note) => note.journal === (section === 'journal')) ?? [];
  const moveToTrash = useMovePageToTrash(listed.reload, listed.reload);
  const empty = emptyStates[section];
  const [pageRows] = useRememberedShape(`pages-${section}`, listed.data && [pages.length], [4]);

  function rows(parentId: string | null, depth: number): ReactNode[] {
    const level = nestedUnder(pages, parentId);
    return (parentId ? level.sort((a, b) => a.position - b.position) : level).flatMap((note) => [
      <li className="flex items-center gap-3 pe-2 hover:bg-line-soft" key={note.id}>
        <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" style={pageIndent(depth)} to={noteHref(note)}>
          <NoteMark note={note} />
          <RowText detail={[spaceNames.get(note.spaceId), formatMoment(note.updatedAt)].filter(Boolean).join(' · ')} title={noteTitle(note)} />
        </Link>
        {writable.some((space) => space.id === note.spaceId) && (
          <ActionsMenu items={[{ label: 'Move to trash', onSelect: () => moveToTrash(note, nestedUnder(pages, note.id).length) }]} name={noteTitle(note)} />
        )}
      </li>,
      ...rows(note.id, depth + 1),
    ]);
  }

  if (listed.error) return <LoadError error={listed.error} onRetry={listed.reload} />;
  if (!listed.data) {
    return (
      <Placeholder label="Loading your pages">
        {pageRows ? (
          <RowsSkeleton lead={<IconSkeleton />} rows={pageRows} />
        ) : (
          <Empty loading title={empty.title}>
            {empty.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }
  if (pages.length === 0) return <Empty title={empty.title}>{empty.hint}</Empty>;
  return <ul className="panel-rows">{rows(null, 0)}</ul>;
}

export function PagesIndex({ section }: { section: PagesSection }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const creating = useAction();
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  function create(spaceId: string, body: { quick?: true }, noun: string) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify(body) });
      navigate(noteHref(created));
      return '';
    }, `Could not create the ${noun}`);
  }

  return (
    <Page
      actions={
        writable.length > 0 && (
          <>
            <IconButton icon="upload" label="Import" onClick={() => setImporting(true)} />
            <CreateButton busy={creating.busy} label="New page" onCreate={(spaceId) => create(spaceId, {}, 'page')} primary spaceId={writable[0]!.id} />
          </>
        )
      }
      tabs={pagesTabs(section)}
      title="Pages"
      toolbarEnd={
        section === 'quick-notes' &&
        (!spaces.data ? (
          <ButtonSkeleton width="w-40" />
        ) : (
          writable.length > 0 && <CreateButton busy={creating.busy} label="New quick note" onCreate={(spaceId) => create(spaceId, { quick: true }, 'quick note')} spaceId={writable[0]!.id} />
        ))
      }
    >
      {importing && <ImportPages onClose={() => setImporting(false)} onDone={announcePagesChanged} spaces={writable} />}
      {section === 'pages' ? (
        <div className="grid gap-4">
          <div className="max-w-md">
            <TextField autoComplete="off" label="Search pages" onChange={(event) => setQuery(event.currentTarget.value)} type="search" value={query} />
          </div>
          {query.trim() ? <PageSearch query={query} /> : <PagesTree />}
        </div>
      ) : (
        <NoteList section={section} />
      )}
    </Page>
  );
}
