import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { EventEditor } from '../components/EventEditor';
import { EventSections, EventSectionsSkeleton, EventSummary, useEvent, useTrashEvent } from '../components/EventDetails';
import { DetailState, Page } from '../components/Page';
import { SkeletonLine } from '../components/Skeletons';

const back = { to: '/agenda', label: 'Agenda' };

export function EventPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { event, poll, space, editable, shape } = useEvent(id);
  const [editing, setEditing] = useState(false);
  const trash = useTrashEvent(
    () => navigate('/agenda'),
    (restored) => navigate(`/events/${restored}`),
  );
  const [wasEditable, located, meeting] = shape;

  if (!event.data) {
    return (
      <DetailState
        actions={wasEditable ? 2 : 0}
        back={back}
        description={
          <>
            <SkeletonLine width="w-80 max-w-full" />
            {located > 0 && <SkeletonLine className="mt-1" width="w-48" />}
            {meeting > 0 && <SkeletonLine className="mt-1" width="w-24" />}
          </>
        }
        resource={event}
        thing="Event"
      >
        <EventSectionsSkeleton shape={shape} />
      </DetailState>
    );
  }
  const details = event.data;

  return (
    <Page
      actions={
        editable && (
          <>
            <ActionsMenu items={[{ label: 'Move to trash', separated: true, onSelect: () => trash(details) }]} name={details.title} />
            <Button icon="pencil" label="Edit" large onClick={() => setEditing(true)} primary />
          </>
        )
      }
      back={back}
      description={<EventSummary details={details} space={space?.name} />}
      title={details.title}
    >
      <EventSections details={details} editable={editable} event={event} poll={poll} />
      {editing && <EventEditor event={details} onClose={() => setEditing(false)} onSaved={(saved) => event.mutate(() => saved)} />}
    </Page>
  );
}
