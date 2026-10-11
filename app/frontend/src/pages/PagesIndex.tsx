import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { EmptyState, Icon, ListSkeleton, Menu, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ImportPages } from '../components/ImportPages';
import { LoadError } from '../components/LoadError';
import { NoteMark } from '../components/NoteMark';
import { HeaderButton, Page } from '../components/Page';
import { announcePagesChanged, noteTitle, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const wording = {
  board: { title: 'Boards', create: 'New board', empty: 'No boards yet', hint: 'A board is a white canvas to draw, sketch and plan on together.' },
  note: { title: 'Pages', create: 'New page', empty: 'No pages yet', hint: 'Pages hold notes, checklists, tables and anything you write.' },
};

export function PagesIndex({ kind }: { kind: 'note' | 'board' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const listed = useResource<Note[]>(`/me/notes?kind=${kind}`, true);
  const creating = useAction();
  const [importing, setImporting] = useState(false);
  const words = wording[kind];
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  function create(spaceId: string) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify(kind === 'board' ? { board: true } : {}) });
      navigate(`/notes/${created.id}`);
      return '';
    }, `Could not create the ${kind === 'board' ? 'board' : 'page'}`);
  }

  return (
    <Page
      actions={
        <>
          {kind === 'note' && writable.length > 0 && <HeaderButton icon="upload" label="Import" onClick={() => setImporting(true)} />}
          {writable.length === 1 ? (
            <HeaderButton disabled={creating.busy} icon="plus" label={words.create} onClick={() => create(writable[0]!.id)} primary />
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
                triggerClassName="primary-button px-3 py-2 text-sm"
                triggerLabel={`${words.create}: choose a space`}
              />
            )
          )}
        </>
      }
      title={words.title}
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
        <ListSkeleton label={`Loading your ${words.title.toLowerCase()}`} rows={4} />
      ) : listed.data.length === 0 ? (
        <EmptyState title={words.empty}>
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">{words.hint}</p>
        </EmptyState>
      ) : (
        <ul className="panel-rows">
          {listed.data.map((note) => (
            <li key={note.id}>
              <Link className="flex items-center gap-3 panel-row text-ink no-underline hover:bg-line-soft" to={`/notes/${note.id}`}>
                <NoteMark note={note} />
                <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
                <span className="mono-sm shrink-0 text-faint">
                  {spaces.data?.find((space) => space.id === note.spaceId)?.name} · {timeAgo(note.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
