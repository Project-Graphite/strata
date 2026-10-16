import { Link, useNavigate } from 'react-router';
import { Icon, ListSkeleton, Menu, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Button, buttonClass } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { NoteMark } from '../../components/NoteMark';
import { Section, Toolbar } from '../../components/Page';
import { RowText } from '../../components/RowText';
import { builtInTemplates, flattenTree, noteTitle, pageIndent, type Note } from '../../notes';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

function PageRow({ depth = 0, note }: { depth?: number; note: Note }) {
  return (
    <li className="flex items-center gap-3 pe-2 hover:bg-line-soft">
      <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" style={pageIndent(depth)} to={`/notes/${note.id}`}>
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
  const notes = useResource<Note[]>(`/spaces/${space.id}/notes`, true);
  const creating = useAction();
  const editable = space.role !== 'viewer';
  const pages = notes.data?.filter((note) => !note.template) ?? [];
  const templates = notes.data?.filter((note) => note.template) ?? [];
  const branches = flattenTree(pages);

  function create(body: Record<string, string | boolean>) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${space.id}/notes`, { method: 'POST', body: JSON.stringify(body) });
      navigate(`/notes/${created.id}`);
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
                  <>
                    From a template
                    <Icon name="chevron-down" size={16} />
                  </>
                }
                triggerClassName={buttonClass()}
                triggerLabel="Start a page from a template"
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
        <ListSkeleton label="Loading the pages in this space" rows={4} />
      ) : branches.length === 0 ? (
        <Empty title="No pages yet">Pages and boards you add to this space show up here.</Empty>
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
