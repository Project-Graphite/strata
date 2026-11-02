import { useEffect } from 'react';
import { ListRow } from '@project-graphite/ui';
import { noteHref, noteTitle, onPagesChanged, type Note } from '../notes';
import { useSpaces } from '../spaces';
import { formatMoment } from '../time';
import { useResource } from '../useResource';
import { ActionsMenu } from './ActionsMenu';
import { useMovePageToTrash } from './MovePageToTrash';
import { NoteMark } from './NoteMark';
import { Section } from './Page';

export function Drafts({ kind }: { kind: 'note' | 'board' }) {
  const spaces = useSpaces();
  const drafts = useResource<Note[]>(`/me/drafts?kind=${kind}`, true, { live: ['page-details', 'pages', 'items', 'spaces'] });
  const reload = drafts.reload;
  useEffect(() => onPagesChanged(reload), [reload]);
  const moveToTrash = useMovePageToTrash(reload, reload);
  const spaceNames = new Map(spaces.data?.map((space) => [space.id, space.name]));
  if (!drafts.data?.length) return null;
  return (
    <Section description={`Untitled ${kind === 'board' ? 'boards' : 'pages'} with nothing in them yet. They move to your ${kind === 'board' ? 'boards' : 'pages'} once you add a title or some content.`} level={3} title="Drafts">
      <ul aria-label="Drafts" className="panel-rows">
        {drafts.data.map((draft) => (
          <ListRow
            href={noteHref(draft)}
            key={draft.id}
            lead={<NoteMark note={draft} />}
            meta={[draft.spaceId && spaceNames.get(draft.spaceId), `Started ${formatMoment(draft.createdAt)}`].filter(Boolean).join(' · ')}
            title={noteTitle(draft)}
            trail={<ActionsMenu items={[{ label: 'Move to trash', onSelect: () => moveToTrash(draft, 0) }]} name={noteTitle(draft)} />}
          />
        ))}
      </ul>
    </Section>
  );
}
