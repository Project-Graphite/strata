import { useState } from 'react';
import { ConfirmDialog, useSnackbar } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { announcePagesChanged, noteTitle, type Note } from '../notes';
import { useAction } from '../useAction';

export function useMovePageToTrash(onMoved: (note: Note) => void) {
  const auth = useAuth();
  const show = useSnackbar();
  const { run } = useAction();
  const [asking, setAsking] = useState<{ note: Note; inside: number }>();

  async function moveToTrash(note: Note) {
    await auth.request(`/items/${note.id}/trash`, { method: 'POST' });
    announcePagesChanged();
    onMoved(note);
    return `Moved ${noteTitle(note)} to the trash.`;
  }

  return {
    move: (note: Note, inside: number) =>
      inside
        ? setAsking({ note, inside })
        : void run(() => moveToTrash(note), `Could not move the ${note.kind === 'board' ? 'board' : 'page'} to the trash`),
    dialog: asking && (
      <ConfirmDialog
        confirmLabel="Move to trash"
        errorFallback="Could not move the page to the trash"
        onClose={() => setAsking(undefined)}
        onConfirm={async () => show({ message: await moveToTrash(asking.note) })}
        title={`Move ${noteTitle(asking.note)} to the trash?`}
      >
        {asking.inside === 1 ? 'The page inside stays' : `The ${asking.inside} pages inside stay`} in the space, at the top level, until you restore{' '}
        {noteTitle(asking.note)}.
      </ConfirmDialog>
    ),
  };
}
