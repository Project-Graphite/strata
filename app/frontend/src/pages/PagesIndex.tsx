import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon, ListSkeleton, Menu, Tabs, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button, buttonClass, IconButton } from '../components/Button';
import { Empty } from '../components/Empty';
import { ImportPages } from '../components/ImportPages';
import { LoadError } from '../components/LoadError';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { NoteMark } from '../components/NoteMark';
import { Page } from '../components/Page';
import { announcePagesChanged, nestedUnder, noteTitle, pageNoun, pagesTabs, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const wording = {
  board: { title: 'Boards', create: 'New board', empty: 'No boards yet', hint: 'A board is a white canvas to draw, sketch and plan on together.' },
  note: { title: 'Pages', create: 'New page', empty: 'No pages yet', hint: 'Pages hold notes, checklists, tables and anything you write.' },
  quick: { title: 'Pages', create: 'New note', empty: 'No notes yet', hint: 'Notes are for quick, one-off writing. Jot one down here or from Home.' },
  journal: { title: 'Pages', create: 'New page', empty: 'No journal entries yet', hint: 'The pages you write from the Journal show up here.' },
};

export function PagesIndex({ kind }: { kind: 'note' | 'board' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const spaces = useSpaces();
  const tab = kind === 'note' ? params.get('tab') : null;
  const shown = tab === 'notes' ? 'quick' : tab === 'journal' ? 'journal' : kind;
  const listed = useResource<Note[]>(`/me/notes?kind=${shown === 'quick' ? 'quick' : kind}`, true);
  const creating = useAction();
  const [importing, setImporting] = useState(false);
  const words = wording[shown];
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const spaceNames = new Map(spaces.data?.map((space) => [space.id, space.name]));
  const pages = listed.data?.filter((note) => note.journal === (shown === 'journal')) ?? [];
  const trashing = useMovePageToTrash(listed.reload, listed.reload);

  function rows(parentId: string | null, depth: number): ReactNode[] {
    const level = nestedUnder(pages, parentId);
    return (parentId ? level.sort((a, b) => a.position - b.position) : level).flatMap((note) => [
      <li className="flex items-center pe-2 hover:bg-line-soft" key={note.id}>
        <Link
          className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline"
          style={depth ? { paddingInlineStart: `${1 + depth * 1.5}rem` } : undefined}
          to={`/notes/${note.id}`}
        >
          <NoteMark note={note} />
          <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
          <span className="mono-sm shrink-0 text-faint">
            {spaceNames.has(note.spaceId) && <span className="max-sm:hidden">{spaceNames.get(note.spaceId)} · </span>}
            {timeAgo(note.updatedAt)}
          </span>
        </Link>
        {writable.some((space) => space.id === note.spaceId) && (
          <ActionsMenu items={[{ label: 'Move to trash', onSelect: () => trashing.move(note, nestedUnder(pages, note.id).length) }]} name={noteTitle(note)} />
        )}
      </li>,
      ...rows(note.id, depth + 1),
    ]);
  }

  function create(spaceId: string) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, {
        method: 'POST',
        body: JSON.stringify(kind === 'board' ? { board: true } : shown === 'quick' ? { quick: true } : {}),
      });
      navigate(`/notes/${created.id}`);
      return '';
    }, `Could not create the ${pageNoun({ kind, quick: shown === 'quick' })}`);
  }

  return (
    <Page
      actions={
        shown !== 'journal' && (
          <>
            {shown === 'note' && writable.length > 0 && <IconButton icon="upload" label="Import" onClick={() => setImporting(true)} />}
            {writable.length === 1 ? (
              <Button disabled={creating.busy} icon="plus" label={words.create} onClick={() => create(writable[0]!.id)} primary />
            ) : (
              writable.length > 1 && (
                <Menu
                  items={writable.map((space) => ({ label: `In ${space.name}`, onSelect: () => create(space.id) }))}
                  label="Spaces"
                  trigger={
                    <>
                      <Icon name="plus" size={16} />
                      {words.create}
                    </>
                  }
                  triggerClassName={buttonClass(true)}
                  triggerLabel={`${words.create}: choose a space`}
                />
              )
            )}
          </>
        )
      }
      title={words.title}
    >
      {kind === 'note' && <Tabs items={pagesTabs(tab)} label="Pages" />}
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
        <ListSkeleton label={`Loading your ${words.title.toLowerCase()}`} rows={4} />
      ) : pages.length === 0 ? (
        <Empty title={words.empty}>{words.hint}</Empty>
      ) : (
        <ul className="panel-rows">{rows(null, 0)}</ul>
      )}
      {trashing.dialog}
    </Page>
  );
}
