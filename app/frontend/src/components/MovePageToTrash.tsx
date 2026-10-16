import { useAuth } from '../auth';
import { announcePagesChanged, noteTitle, pageNoun, type Note } from '../notes';
import { useAction } from '../useAction';

export function useMovePageToTrash(onMoved: (note: Note) => void, onRestored: (note: Note) => void) {
  const auth = useAuth();
  const { run } = useAction();

  return (note: Note, inside: number) =>
    void run(async () => {
      await auth.request(`/items/${note.id}/trash`, { method: 'POST' });
      announcePagesChanged();
      onMoved(note);
      return {
        message: `Moved ${noteTitle(note)} to the trash.${inside ? ` ${inside === 1 ? 'The page inside stays' : `The ${inside} pages inside stay`} at the top level until you restore it.` : ''}`,
        undo: async () => {
          await auth.request(`/items/${note.id}/restore`, { method: 'POST' });
          announcePagesChanged();
          onRestored(note);
          return '';
        },
      };
    }, `Could not move the ${pageNoun(note)} to the trash`);
}
