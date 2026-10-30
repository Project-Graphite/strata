import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ConfirmDialog, IconButton, LinesSkeleton, ListRow, Skeleton, type MenuItem } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { saveBlob, uploadFile } from '../files';
import { readBlob } from '../api';
import { FileSourceContext } from '../components/file-source';
import { ActionsMenu } from '../components/ActionsMenu';
import { AltTextDialog } from '../components/AltTextDialog';
import { Button, TextButton } from '../components/Button';
import { CommitInput } from '../components/CommitInput';
import { DatabaseView } from '../components/database/DatabaseView';
import { PropertyField } from '../components/database/PropertyField';
import { IconPicker } from '../components/IconPicker';
import { LoadError } from '../components/LoadError';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { NoteComments, type QuotedBlock } from '../components/NoteComments';
import { NoteHistory } from '../components/NoteHistory';
import { NoteMark } from '../components/NoteMark';
import type { EditorTools } from '../components/NoteEditor';
import { useAlignedThreads } from '../components/page-blocks';
import { pageMarkdown } from '../components/page-markdown';
import { DetailState, Section, useDocumentTitle } from '../components/Page';
import { ShareLinks } from '../components/ShareLinks';
import { IconButtonSkeleton, rowsOf, SkeletonLine } from '../components/Skeletons';
import { OpenTask } from '../components/OpenTask';
import { useInArea } from '../navigation';
import { usePageNavigation } from '../page-navigation';
import { announcePagesChanged, childPagesPath, noteArea, noteHref, noteParent, noteTitle, pageNoun, type ChildPages, type Note, type NoteDetails, type PropertyValues } from '../notes';
import { itemHref, itemKindName, useSpaces, type Member } from '../spaces';
import { useAction } from '../useAction';
import { useLiveRefresh, useResource } from '../useResource';

const NoteEditor = lazy(() => import('../components/NoteEditor'));

function PageCover({ actions, cover, load }: { actions?: ReactNode; cover: { id: string; alt: string }; load: (fileId: string) => Promise<Blob> }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let created = '';
    let current = true;
    void load(cover.id)
      .then((blob) => {
        if (!current) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => setUrl(''));
    return () => {
      current = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [cover.id, load]);
  return (
    <div className="page-cover">
      {url && <img alt={cover.alt} src={url} />}
      {actions && <div className="page-cover-actions">{actions}</div>}
    </div>
  );
}

function ChildPageRows({ pages }: { pages: Note[] }) {
  return pages.map((child) => <ListRow href={noteHref(child)} key={child.id} lead={<NoteMark note={child} />} title={noteTitle(child)} />);
}

function MoreChildPages({ cursor, parentId, spaceId }: { cursor: string; parentId: string; spaceId: string }) {
  const [shown, setShown] = useState(false);
  const more = useResource<ChildPages>(shown ? childPagesPath(spaceId, parentId, cursor) : null, true);
  if (!shown) return <ListRow onClick={() => setShown(true)} title="Show more pages" />;
  return (
    <>
      <ChildPageRows pages={more.data?.pages ?? []} />
      {more.data?.nextCursor && <MoreChildPages cursor={more.data.nextCursor} parentId={parentId} spaceId={spaceId} />}
    </>
  );
}

export function NotePage() {
  const { id = '' } = useParams();
  const [, setCurrentPage] = usePageNavigation();
  const auth = useAuth();
  const loadFile = useCallback((fileId: string) => auth.request<Blob>(`/notes/${id}/files/${fileId}`, {}, readBlob), [auth.request, id]);
  const spaces = useSpaces();
  const navigate = useNavigate();
  const note = useResource<NoteDetails>(`/notes/${id}`, true, { live: ['page-details', 'items', 'spaces'], itemIds: [id] });
  useLiveRefresh(note.reload, { live: ['page-databases'], itemIds: [id, ...(note.data?.parentId ? [note.data.parentId] : [])], spaceId: note.data?.spaceId });
  const [quoting, setQuoting] = useState<QuotedBlock & { noteId: string }>();
  const [commenting, setCommenting] = useState<string>();
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  const [margin, setMargin] = useState<HTMLElement | null>(null);
  const [describingCover, setDescribingCover] = useState<string>();
  const coverInput = useRef<HTMLInputElement>(null);
  useAlignedThreads(margin);
  const [commentedBlocks, setCommentedBlocks] = useState<string[]>([]);
  const [thread, setThread] = useState<{ id: string }>();
  const [tools, setTools] = useState<EditorTools>();
  const openThread = useCallback((threadId: string) => setThread({ id: threadId }), []);
  const inside = useResource<ChildPages>(note.data && !note.data.quick && note.data.permissions.spaceRole ? childPagesPath(note.data.spaceId, note.data.id) : null, true, { live: ['page-details', 'items'], spaceId: note.data?.spaceId });
  const links = useResource<{ backlinks: { id: string; kind: string; item: { id: string; spaceId: string; kind: string; quick: boolean; title: string } }[] }>(
    note.data ? `/items/${note.data.id}/links` : null,
    true,
    { live: ['page-details', 'pages', 'items'], spaceId: note.data?.spaceId },
  );
  const members = useResource<Member[]>(
    note.data?.permissions.spaceRole && (note.data.permissions.comment || note.data.row?.properties.some((property) => property.type === 'person')) ? `/spaces/${note.data.spaceId}/members` : null,
    true,
  );
  const backlinks = (links.data?.backlinks ?? []).filter((link) => link.kind === 'mention');
  const { report, run } = useAction();
  const adding = useAction();
  const [open, setOpen] = useState<'share' | 'history' | 'unconvert'>();
  const [openTask, setOpenTask] = useState<string>();
  const parent = note.data?.path.at(-1);
  useEffect(() => {
    if (note.data?.id !== id) return;
    setCurrentPage(note.data);
    return () => setCurrentPage((current) => current?.id === id ? undefined : current);
  }, [id, note.data, setCurrentPage]);
  const back = !note.data ? { to: '/pages', label: 'Pages' } : parent ? { to: `/notes/${parent.id}`, label: noteTitle(parent) } : noteParent(note.data);
  const moveToTrash = useMovePageToTrash(
    () => navigate(back.to),
    (restored) => navigate(`/notes/${restored.id}`),
  );
  useInArea(note.data ? noteArea(note.data) : null);
  useDocumentTitle(note.data && noteTitle(note.data));

  if (note.error) return <DetailState back={back} resource={note} thing="Page" />;
  if (!note.data || note.data.id !== id) {
    return (
      <article className="page-enter grid max-w-none gap-8">
        <header className="page-header">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 shrink-0 rounded-field" />
              <SkeletonLine className="note-title" width="w-72 max-w-full" />
            </div>
          </div>
          <div className="page-header-actions">
            {rowsOf(2).map((action) => (
              <IconButtonSkeleton key={action} />
            ))}
          </div>
        </header>
        <LinesSkeleton label="Loading the page" lines={6} />
      </article>
    );
  }
  const details = note.data;
  if (details.kind === 'board') return <Navigate replace to={noteHref(details)} />;
  const space = spaces.data?.find((candidate) => candidate.id === details.spaceId);
  const children = inside.data?.pages ?? [];
  const pageOnly = !details.quick;
  const history = pageOnly && details.permissions.history;

  function quote(block: QuotedBlock) {
    if (quoting && quoting.id !== block.id) tools?.removeComment(quoting.id);
    setQuoting({ ...block, noteId: details.id });
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => document.querySelector(`.note-comments-margin [data-block-id="${CSS.escape(block.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })),
    );
  }

  function addPageInside() {
    void adding.run(async () => {
      const created = await auth.request<Note>(`/spaces/${details.spaceId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ parentId: details.id }),
      });
      navigate(`/notes/${created.id}`);
      return '';
    }, 'Could not add the page');
  }

  function chooseCover(file: File) {
    void run(async () => {
      const uploaded = await uploadFile(auth.request, details.spaceId, file);
      const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify({ cover: uploaded.id, coverAlt: '' }) });
      note.mutate((current) => ({ ...current, ...saved }));
      setDescribingCover(file.name);
      return '';
    }, 'Could not add the cover image');
  }

  function save(change: Partial<Note> & { expectedTitle?: string; coverAlt?: string }, done: (saved: Note) => string, fallback: string) {
    return run(async () => {
      const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify(change) });
      note.mutate((current) => ({ ...current, ...saved }));
      announcePagesChanged();
      return done(saved);
    }, fallback).then((saved) => {
      if (!saved) note.reload();
      return saved;
    });
  }

  function turnIntoDatabase() {
    const option = (name: string, color: string) => ({ id: crypto.randomUUID(), name, color });
    const status = { id: crypto.randomUUID(), name: 'Status', type: 'select', options: [option('To do', 'gray'), option('Doing', 'blue'), option('Done', 'green')] };
    void run(async () => {
      await auth.request(`/notes/${details.id}/database`, {
        method: 'PUT',
        body: JSON.stringify({ properties: [status, { id: crypto.randomUUID(), name: 'Date', type: 'date' }], view: 'table', groupBy: status.id, expectedRevision: null }),
      });
      note.mutate((current) => ({ ...current, database: true }));
      return `Turned ${noteTitle(details)} into a database.`;
    }, 'Could not turn the page into a database');
  }

  function setValue(propertyId: string, value: unknown, expected: unknown) {
    return run(async () => {
      const saved = await auth.request<{ values: PropertyValues }>(`/notes/${details.id}/properties`, {
        method: 'PATCH',
        body: JSON.stringify({ values: { [propertyId]: value }, expectedValues: { [propertyId]: expected } }),
      });
      note.mutate((current) => ({ ...current, row: current.row && { ...current.row, values: saved.values } }));
      return '';
    }, 'Could not save that').then((saved) => {
      if (!saved) note.reload();
      return saved;
    });
  }

  const options: MenuItem[] = [
    ...(details.permissions.organize && details.quick
      ? [{ label: 'Turn into a page', onSelect: () => save({ quick: false }, (saved) => `Turned ${noteTitle(saved)} into a page.`, 'Could not turn the note into a page') }]
      : []),
    ...(details.permissions.organize && pageOnly
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
    ...(pageOnly && details.permissions.organize && !details.cover ? [{ label: 'Add a cover image', onSelect: () => coverInput.current?.click() }] : []),
    ...(pageOnly && details.permissions.organize && !details.database && children.length === 0 ? [{ label: 'Add a page inside', onSelect: addPageInside }] : []),
    ...(pageOnly && details.permissions.comment ? [{ label: 'Add a comment', onSelect: () => setCommenting(details.id) }] : []),
    ...(pageOnly && details.editable && !details.database
      ? [{ label: details.narrow ? 'Use full width' : 'Use narrow width', onSelect: () => save({ narrow: !details.narrow }, () => '', 'Could not change the width') }]
      : []),
    ...(history ? [{ label: 'History', onSelect: () => setOpen('history'), separated: true }] : []),
    ...(tools
      ? [
          { label: 'Find in page', onSelect: tools.find, separated: !history },
          { label: 'Download as Markdown', onSelect: () => saveBlob(new Blob([pageMarkdown(tools.document(), { title: noteTitle(details), pageUrl: `${window.location.origin}/notes/${details.id}` })], { type: 'text/markdown;charset=utf-8' }), `${noteTitle(details).replace(/[\\/:*?"<>|]+/g, '-')}.md`) },
          { label: 'Print or save as PDF', onSelect: () => window.print() },
        ]
      : []),
  ];
  const menu: MenuItem[] = details.permissions.organize
    ? [...options, { label: 'Move to trash', onSelect: () => moveToTrash(details, children.length), separated: options.length > 0 }]
    : options;

  return (
    <article className={`note-page page-enter grid min-w-0 grid-cols-1 gap-8 ${details.quick || (details.narrow && !details.database) ? 'note-narrow' : 'max-w-none'} ${details.database ? 'database-page' : ''}`}>
      <h1 className="sr-only">{noteTitle(details)}</h1>
      {details.permissions.organize && pageOnly && (
        <input
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) chooseCover(file);
          }}
          ref={coverInput}
          tabIndex={-1}
          type="file"
        />
      )}
      {details.cover && pageOnly && (
        <PageCover
          actions={
            details.permissions.organize && (
              <>
                <TextButton label="Change cover" onClick={() => coverInput.current?.click()} />
                <TextButton label="Describe" onClick={() => setDescribingCover(details.cover!.alt)} />
                <TextButton label="Remove" onClick={() => save({ cover: null }, () => '', 'Could not remove the cover image')} />
              </>
            )
          }
          cover={details.cover}
          load={loadFile}
        />
      )}
      <header className="page-header">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            {(details.editable || details.icon) &&
              !details.quick &&
              (details.editable ? <IconPicker icon={details.icon} onPick={(icon) => save({ icon }, () => '', 'Could not change the icon')} /> : <span className="page-icon">{details.icon}</span>)}
            <CommitInput
              autoFocus={details.editable && !details.title}
              className="note-title"
              key={details.id}
              label={details.quick ? 'Note title' : 'Page title'}
              maxLength={200}
              multiline
              onCommit={(title, expectedTitle) => save({ title, expectedTitle }, () => '', `Could not rename the ${pageNoun(details)}`)}
              onEnter={(input) => input.closest('article')?.querySelector<HTMLElement>('.note-content')?.focus()}
              placeholder="Untitled"
              readOnly={!details.editable}
              value={details.title}
            />
          </div>
        </div>
        <div className="page-header-actions">
          <div className="note-status" ref={setStatusSlot} />
          {details.permissions.share && <IconButton icon="link" label="Share" onClick={() => setOpen('share')} />}
          {menu.length > 0 && <ActionsMenu items={menu} name={noteTitle(details)} />}
        </div>
      </header>
      {note.refreshError && <LoadError compact error={note.refreshError} onRetry={note.reload} />}
      {details.row && details.row.properties.length > 0 && (
        <dl aria-label="Properties" className="m-0 grid min-w-0 grid-cols-1 items-center gap-x-4 gap-y-1 text-body sm:grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)]">
          {details.row.properties.map((property) => (
            <Fragment key={property.id}>
              <dt className="min-w-0 wrap-anywhere text-muted">{property.name}</dt>
              <dd className="m-0 min-w-0 max-sm:mb-3">
                <PropertyField
                  editable={details.editable && (property.type !== 'person' || Boolean(details.permissions.spaceRole))}
                  members={members.data}
                  onChange={(value, expected) => setValue(property.id, value, expected)}
                  property={property}
                  value={details.row!.values[property.id]}
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <div className="note-body">
        <FileSourceContext value={loadFile}><Suspense fallback={<LinesSkeleton label="Loading the editor" lines={6} />}>
          <NoteEditor
            commentedBlocks={commentedBlocks}
            editable={details.editable}
            key={details.id}
            noteId={details.id}
            onComment={details.quick || !details.permissions.comment ? undefined : quote}
            onThread={openThread}
            onTools={setTools}
            peopleSpaceId={details.permissions.spaceRole ? details.spaceId : undefined}
            quick={details.quick}
            spaceId={details.permissions.organize ? details.spaceId : ''}
            statusSlot={statusSlot ?? undefined}
          />
        </Suspense></FileSourceContext>
        {!details.quick && (
          <div className="note-comments-margin" ref={setMargin}>
            <NoteComments
              commentable={details.permissions.comment}
              composing={commenting === details.id}
              editable={details.editable}
              focused={thread}
              hideWhenEmpty
              key={`comments-${details.id}`}
              noteId={details.id}
              onAnchorDropped={tools?.removeComment}
              onBlocks={setCommentedBlocks}
              onQuoteDone={() => setQuoting(undefined)}
              owner={space?.role === 'owner'}
              people={members.data}
              quoting={quoting?.noteId === details.id ? quoting : undefined}
            />
          </div>
        )}
      </div>
      {details.database && <DatabaseView editable={details.permissions.organize} key={details.id} noteId={details.id} spaceId={details.spaceId} />}
      {pageOnly && !details.database && children.length > 0 && (
        <Section action={details.permissions.organize && <Button disabled={adding.busy} icon="plus" label="New page" onClick={addPageInside} />} title="Pages inside">
          <ul className="panel-rows">
            <ChildPageRows pages={children} />
            {inside.data?.nextCursor && <MoreChildPages cursor={inside.data.nextCursor} parentId={details.id} spaceId={details.spaceId} />}
          </ul>
        </Section>
      )}
      {backlinks.length > 0 && (
        <details className="note-backlinks">
          <summary className="text-h3 text-ink">Linked from {backlinks.length === 1 ? '1 place' : `${backlinks.length} places`}</summary>
          <ul className="panel-rows">
            {backlinks.map(({ id: linkId, item }) => {
              const kind = itemKindName(item);
              return (
                <ListRow
                  href={item.kind === 'task' ? undefined : (itemHref(item) ?? `/spaces/${item.spaceId}`)}
                  key={linkId}
                  meta={`${kind.charAt(0).toUpperCase()}${kind.slice(1)}`}
                  onClick={item.kind === 'task' ? () => setOpenTask(item.id) : undefined}
                  title={noteTitle(item)}
                />
              );
            })}
          </ul>
        </details>
      )}
      {describingCover !== undefined && details.cover && (
        <AltTextDialog initial={describingCover} onClose={() => setDescribingCover(undefined)} onSave={(alt) => void save({ coverAlt: alt }, () => '', 'Could not describe the cover image')} />
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
      {open === 'share' && <ShareLinks editLinks itemId={details.id} noun={pageNoun(details)} onClose={() => setOpen(undefined)} page />}
      {open === 'history' && <NoteHistory editable={details.editable} noteId={details.id} onClose={() => setOpen(undefined)} />}
      {openTask && <OpenTask onChanged={links.reload} onClose={() => setOpenTask(undefined)} taskId={openTask} />}
    </article>
  );
}
