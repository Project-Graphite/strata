import { useEffect } from 'react';
import { ListRow, Placeholder } from '@project-graphite/ui';
import { noteHref, noteTitle, onPagesChanged, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { formatMoment } from '../time';
import { useResource } from '../useResource';
import { PageActionsMenu } from './PageActionsMenu';
import { Empty } from './Empty';
import { LoadError } from './LoadError';
import { useMovePageToTrash } from './MovePageToTrash';
import { NoteMark } from './NoteMark';
import { IconSkeleton, RowsSkeleton } from './Skeletons';

export function Drafts({ kind }: { kind: 'note' | 'board' }) {
  const spaces = useSpaces();
  const drafts = useResource<Note[]>(`/me/drafts?kind=${kind}`, true, { live: ['page-details', 'pages', 'items', 'spaces'] });
  const reload = drafts.reload;
  useEffect(() => onPagesChanged(reload), [reload]);
  const moveToTrash = useMovePageToTrash(reload, reload);
  const spaceNames = new Map(spaces.data?.map((space) => [space.id, space.name]));
  const noun = kind === 'board' ? 'boards' : 'pages';
  if (drafts.error) return <LoadError error={drafts.error} onRetry={drafts.reload} />;
  if (!drafts.data) {
    return (
      <Placeholder label="Loading your drafts">
        <RowsSkeleton lead={<IconSkeleton />} rows={3} />
      </Placeholder>
    );
  }
  if (drafts.data.length === 0) {
    return (
      <Empty icon={kind === 'board' ? 'board' : 'file'} title="No drafts" variant="page">
        Untitled {noun} with nothing in them yet wait here until you add a title or some content.
      </Empty>
    );
  }
  return (
    <ul aria-label="Drafts" className="panel-rows">
      {drafts.data.map((draft) => (
        <ListRow
          href={noteHref(draft)}
          key={draft.id}
          lead={<NoteMark note={draft} />}
          meta={[draft.spaceId && spaceNames.get(draft.spaceId), `Started ${formatMoment(draft.createdAt)}`].filter(Boolean).join(' · ')}
          title={noteTitle(draft)}
          trail={<PageActionsMenu note={draft} onTrash={() => moveToTrash(draft, 0)} />}
        />
      ))}
    </ul>
  );
}
