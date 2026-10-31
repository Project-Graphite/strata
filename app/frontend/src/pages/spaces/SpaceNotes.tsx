import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ListRow, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { AddButton } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { NoteMark } from '../../components/NoteMark';
import { Section, usePagePrimary } from '../../components/Page';
import { IconSkeleton, RowsSkeleton, useRememberedShape } from '../../components/Skeletons';
import { builtInTemplates, flattenTree, noteHref, noteTitle, type Note } from '../../notes';
import { capitalised, formatMoment } from '../../time';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace, useSpaceMenu } from './SpaceLayout';

const empty = { title: 'No pages yet', hint: 'Pages and boards you add to this space show up here.' };

const nested = ['', 'ps-12', 'ps-20', 'ps-28'];

function PageRow({ depth = 0, note }: { depth?: number; note: Note }) {
  return (
    <ListRow
      className={nested[Math.min(depth, nested.length - 1)]}
      href={noteHref(note)}
      lead={<NoteMark note={note} />}
      meta={capitalised([note.kind === 'board' && 'Board', note.pinnedAt && 'Pinned', formatMoment(note.updatedAt)].filter(Boolean).join(' · '))}
      title={noteTitle(note)}
    />
  );
}

export function SpaceNotes() {
  const auth = useAuth();
  const space = useSpace();
  const navigate = useNavigate();
  const notes = useResource<Note[]>(`/spaces/${space.id}/notes`, true, { live: ['page-details', 'pages', 'items'], spaceId: space.id });
  const creating = useAction();
  const editable = space.role !== 'viewer';
  const pages = notes.data?.filter((note) => !note.template) ?? [];
  const templates = notes.data?.filter((note) => note.template) ?? [];
  const branches = flattenTree(pages);
  const [pageRows, templateRows] = useRememberedShape(`space-pages-${space.id}`, notes.data && [branches.length, templates.length], [4, 0]);
  const setMenu = useSpaceMenu();
  usePagePrimary(editable && <AddButton disabled={creating.busy} label="New page" large onClick={() => create({})} primary />);

  function create(body: Record<string, string | boolean>) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${space.id}/notes`, { method: 'POST', body: JSON.stringify(body) });
      navigate(noteHref(created));
      return '';
    }, 'Could not add the page');
  }

  useEffect(() => {
    if (!editable) return;
    setMenu([
      { label: 'New board', onSelect: () => create({ board: true }) },
      ...builtInTemplates.map(([template, label]) => ({ label: `New page from ${label}`, onSelect: () => create({ template, title: label }) })),
      ...(notes.data ?? [])
        .filter((note) => note.template)
        .map((note) => ({ label: `New page from ${noteTitle(note)}`, onSelect: () => create({ fromNoteId: note.id, title: note.title }) })),
    ]);
    return () => setMenu([]);
  }, [editable, notes.data, setMenu]);

  return (
    <>
      {notes.error ? (
        <LoadError error={notes.error} onRetry={notes.reload} />
      ) : !notes.data ? (
        <Placeholder className="grid gap-8" label="Loading the pages in this space">
          {pageRows ? (
            <RowsSkeleton lead={<IconSkeleton />} rows={pageRows} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
          {templateRows > 0 && (
            <Section title="Templates">
              <RowsSkeleton lead={<IconSkeleton />} rows={templateRows} />
            </Section>
          )}
        </Placeholder>
      ) : branches.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <ul className="panel-rows">
          {branches.map(({ note, depth }) => (
            <PageRow depth={depth} key={note.id} note={note} />
          ))}
        </ul>
      )}
      {templates.length > 0 && (
        <Section title="Templates">
          <ul className="panel-rows">
            {templates.map((note) => (
              <PageRow key={note.id} note={note} />
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
