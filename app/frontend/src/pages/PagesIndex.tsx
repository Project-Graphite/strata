import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon, IconButton, Menu, Placeholder, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { ImportPages } from '../components/ImportPages';
import { LoadError } from '../components/LoadError';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { NoteMark } from '../components/NoteMark';
import { Page } from '../components/Page';
import { RowText } from '../components/RowText';
import { ButtonSkeleton, IconSkeleton, RowsSkeleton, useRememberedShape } from '../components/Skeletons';
import { announcePagesChanged, nestedUnder, noteTitle, pageIndent, pagesTabs, type Note, type PagesSection } from '../notes';
import { useSpaces, type Space } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const emptyStates = {
  pages: { title: 'No pages yet', hint: 'Pages hold notes, checklists, tables and anything else you write.' },
  'quick-notes': { title: 'No quick notes yet', hint: 'Quick notes are for one-off jots. Write one here or from Home.' },
  journal: { title: 'No journal entries yet', hint: 'The pages you write from the Journal show up here.' },
  boards: { title: 'No boards yet', hint: 'A board is a blank canvas to draw, sketch and plan on together.' },
};

function CreateButton({ busy, label, onCreate, primary = false, spaces }: { busy: boolean; label: string; onCreate: (spaceId: string) => void; primary?: boolean; spaces: Space[] }) {
  if (spaces.length === 1) return <Button disabled={busy} icon="plus" label={label} onClick={() => onCreate(spaces[0]!.id)} primary={primary} />;
  return (
    <Menu
      items={spaces.map((space) => ({ label: `In ${space.name}`, onSelect: () => onCreate(space.id) }))}
      label="Spaces"
      trigger={
        <span className="inline-flex items-center gap-2">
          <Icon name="plus" size={18} />
          {label}
        </span>
      }
      triggerLabel={`${label}: choose a space`}
      triggerVariant={primary ? 'primary' : 'secondary'}
    />
  );
}

export function PagesIndex({ section }: { section: PagesSection | 'boards' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const listed = useResource<Note[]>(`/me/notes?kind=${section === 'boards' ? 'board' : section === 'quick-notes' ? 'quick' : 'note'}`, true, { live: ['page-details', 'pages', 'items', 'spaces'] });
  const creating = useAction();
  const [importing, setImporting] = useState(false);
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
        <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" style={pageIndent(depth)} to={`/notes/${note.id}`}>
          <NoteMark note={note} />
          <RowText detail={[spaceNames.get(note.spaceId), timeAgo(note.updatedAt)].filter(Boolean).join(' · ')} title={noteTitle(note)} />
        </Link>
        {writable.some((space) => space.id === note.spaceId) && (
          <ActionsMenu items={[{ label: 'Move to trash', onSelect: () => moveToTrash(note, nestedUnder(pages, note.id).length) }]} name={noteTitle(note)} />
        )}
      </li>,
      ...rows(note.id, depth + 1),
    ]);
  }

  function create(spaceId: string, body: { board?: true; quick?: true }, noun: string) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify(body) });
      navigate(`/notes/${created.id}`);
      return '';
    }, `Could not create the ${noun}`);
  }

  return (
    <Page
      actions={
        writable.length > 0 &&
        (section === 'boards' ? (
          <CreateButton busy={creating.busy} label="New board" onCreate={(spaceId) => create(spaceId, { board: true }, 'board')} primary spaces={writable} />
        ) : (
          <>
            <IconButton icon="upload" label="Import" onClick={() => setImporting(true)} />
            <CreateButton busy={creating.busy} label="New page" onCreate={(spaceId) => create(spaceId, {}, 'page')} primary spaces={writable} />
          </>
        ))
      }
      tabs={section === 'boards' ? undefined : pagesTabs(section)}
      title={section === 'boards' ? 'Boards' : 'Pages'}
      toolbarEnd={
        section === 'quick-notes' &&
        (!spaces.data ? (
          <ButtonSkeleton width="w-40" />
        ) : (
          writable.length > 0 && <CreateButton busy={creating.busy} label="New quick note" onCreate={(spaceId) => create(spaceId, { quick: true }, 'quick note')} spaces={writable} />
        ))
      }
    >
      {importing && (
        <ImportPages
          onClose={() => setImporting(false)}
          onDone={() => {
            listed.reload();
            announcePagesChanged();
          }}
          spaces={writable}
        />
      )}
      {listed.error ? (
        <LoadError error={listed.error} onRetry={listed.reload} />
      ) : !listed.data ? (
        <Placeholder label={`Loading your ${section === 'boards' ? 'boards' : 'pages'}`}>
          {pageRows ? (
            <RowsSkeleton lead={<IconSkeleton />} rows={pageRows} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : pages.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <ul className="panel-rows">{rows(null, 0)}</ul>
      )}
    </Page>
  );
}
