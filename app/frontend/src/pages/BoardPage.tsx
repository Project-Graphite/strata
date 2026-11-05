import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { IconButton, LinesSkeleton } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { WatchButton } from '../components/WatchButton';
import { CommentsButton, CommentsPanel } from '../components/CommentsPanel';
import { CommitInput } from '../components/CommitInput';
import { CrashBoundary } from '../components/CrashBoundary';
import { FileSourceContext } from '../components/file-source';
import { IconPicker } from '../components/IconPicker';
import { useMovePageToTrash } from '../components/MovePageToTrash';
import { NoteComments, type CommentAnchors, type QuotedBlock } from '../components/NoteComments';
import { NoteHistory } from '../components/NoteHistory';
import { DetailState, useDocumentTitle } from '../components/Page';
import { ShareLinks } from '../components/ShareLinks';
import { addressOf, announcePagesChanged, noteHref, noteTitle, type Note, type NoteDetails } from '../notes';
import { usePageNavigation } from '../page-navigation';
import { useAllSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useLiveRefresh, useResource } from '../useResource';

const BoardCanvas = lazy(() => import('../components/BoardCanvas'));

const boards = { to: '/boards', label: 'Boards' };

export function BoardPage() {
  const { id: address = '' } = useParams();
  const [, setCurrentPage] = usePageNavigation();
  const auth = useAuth();
  const spaces = useAllSpaces();
  const navigate = useNavigate();
  const location = useLocation();
  const note = useResource<NoteDetails>(`/notes/${address}`, true);
  const loaded = note.data && addressOf(note.data, address) ? note.data : undefined;
  const id = loaded?.id ?? address;
  const loadFile = useCallback((fileId: string) => auth.request<Blob>(`/notes/${id}/files/${fileId}`, {}, readBlob), [auth.request, id]);
  useLiveRefresh(note.reload, { live: ['page-details', 'items', 'spaces'], itemIds: [id] });
  const [quoting, setQuoting] = useState<QuotedBlock>();
  const [commentedBlocks, setCommentedBlocks] = useState<string[]>([]);
  const [anchors, setAnchors] = useState<CommentAnchors>();
  const [commenting, setCommenting] = useState(false);
  const [threads, setThreads] = useState(0);
  const [open, setOpen] = useState<'share' | 'history'>();
  const { run } = useAction();
  useEffect(() => {
    if (!loaded) return;
    setCurrentPage(loaded);
    return () => setCurrentPage((current) => current?.id === loaded.id ? undefined : current);
  }, [loaded, setCurrentPage]);
  const moveToTrash = useMovePageToTrash(
    () => navigate(boards.to),
    (restored) => navigate(noteHref(restored)),
  );
  useDocumentTitle(note.data && noteTitle(note.data));

  if (note.error) return <DetailState back={boards} resource={note} thing="Board" />;
  if (!loaded) {
    return (
      <div className="board-area">
        <LinesSkeleton label="Loading the board" lines={6} />
      </div>
    );
  }
  const details = loaded;
  if (noteHref(details) !== location.pathname) return <Navigate replace to={`${noteHref(details)}${location.search}${location.hash}`} />;
  const space = spaces.data?.find((candidate) => candidate.id === details.spaceId);

  function save(change: Partial<Note> & { expectedTitle?: string }, fallback: string) {
    return run(async () => {
      const saved = await auth.request<Note>(`/notes/${details.id}`, { method: 'PATCH', body: JSON.stringify(change) });
      note.mutate((current) => ({ ...current, ...saved }));
      announcePagesChanged();
      return '';
    }, fallback).then((saved) => {
      if (!saved) note.reload();
      return saved;
    });
  }

  function openThread(blockId: string) {
    setCommenting(true);
    window.setTimeout(() => document.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  return (
    <div className="board-area">
      <h1 className="sr-only">{noteTitle(details)}</h1>
      <FileSourceContext value={loadFile}>
        <CrashBoundary label="This board">
        <Suspense fallback={<LinesSkeleton label="Loading the board" lines={6} />}>
          <BoardCanvas
            bar={{
              back: boards,
              title: (
                <>
                  {(details.editable || details.icon) &&
                    (details.editable ? <IconPicker icon={details.icon} onPick={(icon) => save({ icon }, 'Could not change the icon')} /> : <span className="page-icon">{details.icon}</span>)}
                  <CommitInput
                    autoFocus={details.editable && !details.title}
                    className="board-title"
                    label="Board title"
                    maxLength={200}
                    onCommit={(title, expectedTitle) => save({ title, expectedTitle }, 'Could not rename the board')}
                    placeholder="Untitled"
                    readOnly={!details.editable}
                    value={details.title}
                  />
                </>
              ),
              actions: (
                <>
                  {details.spaceId && <WatchButton itemId={details.id} manage={details.editable} spaceId={details.spaceId} />}
                  {details.permissions.share && <IconButton icon="link" label="Share" onClick={() => setOpen('share')} />}
                  <CommentsButton count={threads} onClick={() => setCommenting(!commenting)} open={commenting} />
                </>
              ),
              menu: [
                ...(details.permissions.history ? [{ label: 'History', onSelect: () => setOpen('history') }] : []),
                ...(details.permissions.organize ? [{ label: 'Move to trash', onSelect: () => moveToTrash(details, 0) }] : []),
              ],
            }}
            commentedBlocks={commentedBlocks}
            editable={details.editable}
            noteId={details.id}
            onAnchors={setAnchors}
            onComment={
              details.permissions.comment
                ? (block) => {
                    setQuoting(block);
                    setCommenting(true);
                  }
                : undefined
            }
            onOpenThread={openThread}
            spaceId={details.permissions.organize ? details.spaceId : ''}
            startTemplate={details.draft && Date.now() - Date.parse(details.createdAt) < 60_000 ? space?.defaults?.board.template : undefined}
          />
        </Suspense>
        </CrashBoundary>
      </FileSourceContext>
      <CommentsPanel docked onClose={() => setCommenting(false)} open={commenting}>
        <CrashBoundary compact label="Comments">
        <NoteComments
          anchors={anchors}
          commentable={details.permissions.comment}
          editable={details.editable}
          noteId={details.id}
          onBlocks={setCommentedBlocks}
          onCount={setThreads}
          onQuoteDone={() => setQuoting(undefined)}
          owner={space?.role === 'owner'}
          quoting={quoting}
        />
        </CrashBoundary>
      </CommentsPanel>
      {open === 'share' && <ShareLinks editLinks itemId={details.id} noun="board" onClose={() => setOpen(undefined)} page={noteHref(details)} />}
      {open === 'history' && <CrashBoundary compact label="History"><NoteHistory editable={details.editable} noteId={details.id} onClose={() => setOpen(undefined)} /></CrashBoundary>}
    </div>
  );
}
