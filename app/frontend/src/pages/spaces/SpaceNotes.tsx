import { Link, useNavigate } from 'react-router';
import { Icon, Menu, Placeholder, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Button } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { NoteMark } from '../../components/NoteMark';
import { Section, Toolbar } from '../../components/Page';
import { RowText } from '../../components/RowText';
import { IconSkeleton, RowsSkeleton, useRememberedShape } from '../../components/Skeletons';
import { builtInTemplates, flattenTree, noteHref, noteTitle, pageIndent, type Note } from '../../notes';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

const empty = { title: 'No pages yet', hint: 'Pages and boards you add to this space show up here.' };

function PageRow({ depth = 0, note }: { depth?: number; note: Note }) {
  return (
    <li className="flex items-center gap-3 pe-2 hover:bg-line-soft">
      <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" style={pageIndent(depth)} to={noteHref(note)}>
        <NoteMark note={note} />
        <RowText
          detail={[note.kind === 'board' && 'Board', note.pinnedAt && 'Pinned', timeAgo(note.updatedAt)].filter(Boolean).join(' · ')}
          title={noteTitle(note)}
        />
      </Link>
    </li>
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

  function create(body: Record<string, string | boolean>) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${space.id}/notes`, { method: 'POST', body: JSON.stringify(body) });
      navigate(noteHref(created));
      return '';
    }, 'Could not add the page');
  }

  return (
    <>
      {editable && (
        <Toolbar
          actions={
            <>
              <Menu
                items={[
                  ...builtInTemplates.map(([template, label]) => ({ label, onSelect: () => create({ template, title: label }) })),
                  ...templates.map((note, index) => ({ label: noteTitle(note), onSelect: () => create({ fromNoteId: note.id, title: note.title }), separated: index === 0 })),
                ]}
                label="Templates"
                trigger={
                  <span className="inline-flex items-center gap-2">
                    From a template
                    <Icon name="chevron-down" size={18} />
                  </span>
                }
                triggerLabel="Start a page from a template"
                triggerVariant="secondary"
              />
              <Button disabled={creating.busy} icon="plus" label="New board" onClick={() => create({ board: true })} />
              <Button disabled={creating.busy} icon="plus" label="New page" onClick={() => create({})} />
            </>
          }
        />
      )}
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
