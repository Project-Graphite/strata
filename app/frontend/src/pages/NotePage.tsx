import ButtonBase from '@mui/material/ButtonBase';
import InputBase from '@mui/material/InputBase';
import { Fragment, lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmDialog, IconButton, LinesSkeleton, type MenuItem } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { DatabaseView } from '../components/database/DatabaseView';
import { PropertyField } from '../components/database/PropertyField';
import { Hint } from '../components/Hint';
import { IconPicker } from '../components/IconPicker';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { NoteComments, type CommentAnchors, type QuotedBlock } from '../components/NoteComments';
import { NoteHistory } from '../components/NoteHistory';
import { NoteMark } from '../components/NoteMark';
import { BackLink, DetailState, Section, useDocumentTitle } from '../components/Page';
import { RowText } from '../components/RowText';
import { ShareLinks } from '../components/ShareLinks';
import { OpenTask } from '../components/TaskEditor';
import { useInArea } from '../navigation';
import { announcePagesChanged, noteArea, noteParent, noteTitle, pageNoun, type Note, type NoteDetails, type PropertyValues } from '../notes';
import { itemHref, itemKindName, useSpaces, type Member } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

const NoteEditor = lazy(() => import('../components/NoteEditor'));
const BoardCanvas = lazy(() => import('../components/BoardCanvas'));

const wideKey = 'strata-wide-pages';

const widePages = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(wideKey) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
})();

const linkRow = 'flex w-full items-center gap-3 panel-row text-left text-ink no-underline hover:bg-line-soft';

export function NotePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const note = useResource<NoteDetails>(`/notes/${id}`, true);
  const [wide, setWide] = useState(() => widePages.has(id));
  if (wide !== widePages.has(id)) setWide(widePages.has(id));
  const [quoting, setQuoting] = useState<QuotedBlock & { noteId: string }>();
  const [commentedBlocks, setCommentedBlocks] = useState<string[]>([]);
  const [boardAnchors, setBoardAnchors] = useState<CommentAnchors>();
  const pages = useResource<Note[]>(note.data && !note.data.quick ? `/spaces/${note.data.spaceId}/notes` : null, true);
  const links = useResource<{ backlinks: { id: string; kind: string; item: { id: string; spaceId: string; kind: string; quick: boolean; title: string } }[] }>(
    note.data ? `/items/${note.data.id}/links` : null,
    true,
  );
  const members = useResource<Member[]>(
    note.data?.row?.properties.some((property) => property.type === 'person') ? `/spaces/${note.data.spaceId}/members` : null,
    true,
  );
  const backlinks = (links.data?.backlinks ?? []).filter((link) => link.kind === 'mention');
  const { report, run } = useAction();
  const adding = useAction();
  const [open, setOpen] = useState<'share' | 'history' | 'unconvert'>();
  const [openTask, setOpenTask] = useState<string>();
  const parent = note.data?.path.at(-1);
  const back = !note.data ? { to: '/pages', label: 'Pages' } : parent ? { to: `/notes/${parent.id}`, label: noteTitle(parent) } : noteParent(note.data);
  const moveToTrash = useMovePageToTrash(
    () => navigate(back.to),
    (restored) => navigate(`/notes/${restored.id}`),
  );
  useInArea(note.data ? noteArea(note.data) : null);
  useDocumentTitle(note.data && noteTitle(note.data));

  if (!note.data) return <DetailState back={back} resource={note} thing="Page" />;
  const details = note.data;
  const space = spaces.data?.find((candidate) => candidate.id === details.spaceId);
  const children = (pages.data ?? []).filter((page) => page.parentId === details.id);
  const pageOnly = details.kind !== 'board' && !details.quick;

  function quote(block: QuotedBlock) {
    setQuoting({ ...block, noteId: details.id });
    window.setTimeout(() => document.querySelector('section[aria-label="Comments"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function save(change: Partial<Note>, done: (saved: Note) => string, fallback: string) {
    void run(async () => {
      const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify(change) });
      note.mutate((current) => ({ ...current, ...saved }));
      announcePagesChanged();
      pages.mutate((current) => current.map((page) => (page.id === saved.id ? saved : page)));
      return done(saved);
    }, fallback);
  }

  function toggleWide() {
    if (!widePages.delete(details.id)) widePages.add(details.id);
    setWide(widePages.has(details.id));
    try {
      localStorage.setItem(wideKey, JSON.stringify([...widePages]));
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
  }

  function turnIntoDatabase() {
    const option = (name: string, color: string) => ({ id: crypto.randomUUID(), name, color });
    const status = { id: crypto.randomUUID(), name: 'Status', type: 'select', options: [option('To do', 'gray'), option('Doing', 'blue'), option('Done', 'green')] };
    void run(async () => {
      await auth.request(`/notes/${details.id}/database`, {
        method: 'PUT',
        body: JSON.stringify({ properties: [status, { id: crypto.randomUUID(), name: 'Date', type: 'date' }], view: 'table', groupBy: status.id }),
      });
      note.mutate((current) => ({ ...current, database: true }));
      return `Turned ${noteTitle(details)} into a database.`;
    }, 'Could not turn the page into a database');
  }

  function setValue(propertyId: string, value: unknown) {
    void run(async () => {
      const saved = await auth.request<{ values: PropertyValues }>(`/notes/${details.id}/properties`, {
        method: 'PATCH',
        body: JSON.stringify({ values: { [propertyId]: value } }),
      });
      note.mutate((current) => ({ ...current, row: current.row && { ...current.row, values: saved.values } }));
      return '';
    }, 'Could not save that');
  }

  const options: MenuItem[] = [
    ...(details.editable && details.quick
      ? [{ label: 'Turn into a page', onSelect: () => save({ quick: false }, (saved) => `Turned ${noteTitle(saved)} into a page.`, 'Could not turn the note into a page') }]
      : []),
    ...(details.editable && pageOnly
      ? [
          { label: details.database ? 'Turn back into a page' : 'Turn into a database', onSelect: () => (details.database ? setOpen('unconvert') : turnIntoDatabase()) },
          {
            label: details.template ? 'Stop using as a template' : 'Use as a template',
            onSelect: () =>
              save(
                { template: !details.template },
                (saved) => (saved.template ? 'New pages in this space can start from this one.' : 'This page is no longer a template.'),
                'Could not change the page',
              ),
          },
        ]
      : []),
    ...(pageOnly && !details.database ? [{ label: wide ? 'Standard width' : 'Full width', onSelect: toggleWide }] : []),
  ];
  const menu: MenuItem[] = details.editable
    ? [...options, { label: 'Move to trash', onSelect: () => moveToTrash(details, children.length), separated: options.length > 0 }]
    : options;

  return (
    <article className={`page-enter grid gap-8 ${details.kind === 'board' || wide ? 'max-w-none' : details.database ? 'database-page max-w-6xl' : 'max-w-3xl'}`}>
      <header className="page-header">
        <div className="min-w-0 flex-1">
          <p className="page-header-eyebrow">
            <BackLink back={back} />
          </p>
          <div className="flex items-center gap-3">
            {(details.editable || details.icon) &&
              !details.quick &&
              (details.editable ? <IconPicker icon={details.icon} onPick={(icon) => save({ icon }, () => '', 'Could not change the icon')} /> : <span className="page-icon">{details.icon}</span>)}
            <InputBase
              autoFocus={details.editable && !details.title}
              defaultValue={details.title}
              fullWidth
              key={details.id}
              onBlur={(event) => {
                const title = event.currentTarget.value.trim();
                if (details.editable && title !== details.title) save({ title }, () => '', `Could not rename the ${pageNoun(details)}`);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.closest('article')?.querySelector<HTMLElement>('.note-content')?.focus();
                }
              }}
              placeholder="Untitled"
              readOnly={!details.editable}
              slotProps={{ input: { 'aria-label': details.quick ? 'Note title' : 'Page title', className: 'note-title', maxLength: 200 } }}
            />
          </div>
        </div>
        <div className="page-header-actions">
          {details.editable && <IconButton icon="link" label="Share" onClick={() => setOpen('share')} />}
          {!details.quick && <IconButton icon="clock" label="History" onClick={() => setOpen('history')} />}
          {menu.length > 0 && <ActionsMenu items={menu} name={noteTitle(details)} />}
        </div>
      </header>
      {details.row && details.row.properties.length > 0 && (
        <dl aria-label="Properties" className="m-0 grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-x-4 gap-y-1 text-sm">
          {details.row.properties.map((property) => (
            <Fragment key={property.id}>
              <dt className="text-muted">{property.name}</dt>
              <dd className="m-0">
                <PropertyField
                  editable={details.editable}
                  members={members.data}
                  onChange={(value) => setValue(property.id, value)}
                  property={property}
                  value={details.row!.values[property.id]}
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <Suspense fallback={<LinesSkeleton label="Loading the editor" lines={6} />}>
        {details.kind === 'board' ? (
          <BoardCanvas
            commentedBlocks={commentedBlocks}
            editable={details.editable}
            key={details.id}
            noteId={details.id}
            onAnchors={setBoardAnchors}
            onComment={quote}
            spaceId={details.spaceId}
          />
        ) : (
          <NoteEditor
            commentedBlocks={commentedBlocks}
            editable={details.editable}
            key={details.id}
            noteId={details.id}
            onComment={details.quick ? undefined : quote}
            quick={details.quick}
            spaceId={details.spaceId}
          />
        )}
      </Suspense>
      {details.database && <DatabaseView editable={details.editable} key={details.id} noteId={details.id} spaceId={details.spaceId} />}
      {pageOnly && !details.database && (children.length > 0 || details.editable) && (
        <Section
          action={
            details.editable && (
              <Button
                disabled={adding.busy}
                icon="plus"
                label="New page"
                large
                onClick={() =>
                  void adding.run(async () => {
                    const created = await auth.request<Note>(`/spaces/${details.spaceId}/notes`, {
                      method: 'POST',
                      body: JSON.stringify({ parentId: details.id }),
                    });
                    navigate(`/notes/${created.id}`);
                    return '';
                  }, 'Could not add the page')
                }
              />
            )
          }
          title="Pages inside"
        >
          {children.length > 0 ? (
            <ul className="panel-rows">
              {children.map((child) => (
                <li key={child.id}>
                  <Link className={linkRow} to={`/notes/${child.id}`}>
                    <NoteMark note={child} />
                    <RowText title={noteTitle(child)} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Hint>No pages inside yet.</Hint>
          )}
        </Section>
      )}
      {backlinks.length > 0 && (
        <Section title="Linked from">
          <ul className="panel-rows">
            {backlinks.map(({ id: linkId, item }) => {
              const kind = itemKindName(item);
              const text = <RowText detail={`${kind.charAt(0).toUpperCase()}${kind.slice(1)}`} title={noteTitle(item)} />;
              return (
                <li key={linkId}>
                  {item.kind === 'task' ? (
                    <ButtonBase className={`${linkRow} justify-start`} onClick={() => setOpenTask(item.id)}>
                      {text}
                    </ButtonBase>
                  ) : (
                    <Link className={linkRow} to={itemHref(item) ?? `/spaces/${item.spaceId}`}>
                      {text}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {!details.quick && (
        <NoteComments
          anchors={details.kind === 'board' ? boardAnchors : undefined}
          editable={details.editable}
          key={`comments-${details.id}`}
          noteId={details.id}
          onBlocks={setCommentedBlocks}
          onQuoteDone={() => setQuoting(undefined)}
          owner={space?.role === 'owner'}
          quoting={quoting?.noteId === details.id ? quoting : undefined}
        />
      )}
      {open === 'unconvert' && (
        <ConfirmDialog
          busyLabel="Turning back…"
          confirmLabel="Turn back into a page"
          errorFallback="Could not change the page"
          onClose={() => setOpen(undefined)}
          onConfirm={async () => {
            await auth.request(`/notes/${details.id}/database`, { method: 'DELETE' });
            note.mutate((current) => ({ ...current, database: false }));
            report(`Turned ${noteTitle(details)} back into a page.`);
          }}
          title="Turn back into a page?"
          tone="danger"
        >
          The pages inside stay, but the values of their properties are deleted.
        </ConfirmDialog>
      )}
      {open === 'share' && <ShareLinks editLinks={details.kind === 'board'} itemId={details.id} noun={pageNoun(details)} onClose={() => setOpen(undefined)} />}
      {open === 'history' && <NoteHistory editable={details.editable} noteId={details.id} onClose={() => setOpen(undefined)} />}
      {openTask && <OpenTask onChanged={links.reload} onClose={() => setOpenTask(undefined)} taskId={openTask} />}
    </article>
  );
}
