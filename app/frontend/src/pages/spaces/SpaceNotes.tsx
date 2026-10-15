import { Link, useNavigate } from 'react-router';
import { Icon, ListSkeleton, Menu } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { Button, buttonClass } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { Hint } from '../../components/Hint';
import { LoadError } from '../../components/LoadError';
import { NoteMark } from '../../components/NoteMark';
import { Subheading, Toolbar } from '../../components/Page';
import { builtInTemplates, flattenTree, noteTitle, type Note } from '../../notes';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';

function PageRow({ depth = 0, note }: { depth?: number; note: Note }) {
  return (
    <li>
      <Link
        className="flex items-center gap-2 py-3.5 pr-4 text-ink no-underline hover:bg-line-soft"
        style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
        to={`/notes/${note.id}`}
      >
        <NoteMark note={note} />
        <span className="min-w-0 flex-1 truncate">{noteTitle(note)}</span>
        {note.kind === 'board' && <span className="text-xs text-faint">Board</span>}
        {note.pinnedAt && <span className="text-xs text-faint">Pinned</span>}
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

  if (notes.error) return <LoadError error={notes.error} onRetry={notes.reload} />;
  if (!notes.data) return <ListSkeleton label="Loading the pages in this space" rows={4} />;
  const pages = notes.data.filter((note) => !note.template);
  const templates = notes.data.filter((note) => note.template);
  const branches = flattenTree(pages);

  function create(body: Record<string, string | boolean>) {
    void creating.run(async () => {
      const created = await auth.request<Note>(`/spaces/${space.id}/notes`, { method: 'POST', body: JSON.stringify(body) });
      navigate(`/notes/${created.id}`);
      return '';
    }, 'Could not create the page');
  }

  return (
    <>
      <Toolbar
        actions={
          editable && (
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
              <Button disabled={creating.busy} icon="board" label="New board" onClick={() => create({ board: true })} />
              <Button disabled={creating.busy} icon="plus" label="New page" onClick={() => create({})} primary />
            </>
          )
        }
      >
        <Hint>{pages.length === 1 ? '1 page' : `${pages.length} pages`}</Hint>
      </Toolbar>
      {branches.length === 0 ? (
        <Empty title="No pages yet" />
      ) : (
        <ul className="panel-rows">
          {branches.map(({ note, depth }) => (
            <PageRow depth={depth} key={note.id} note={note} />
          ))}
        </ul>
      )}
      {templates.length > 0 && (
        <section className="grid gap-2">
          <Subheading level={2}>Templates in this space</Subheading>
          <ul className="panel-rows">
            {templates.map((note) => (
              <PageRow key={note.id} note={note} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
