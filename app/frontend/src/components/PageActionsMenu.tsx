import { useSnackbar } from '@project-graphite/ui';
import { noteHref, noteTitle, type Note } from '../notes';
import { ActionsMenu } from './ActionsMenu';

export function PageActionsMenu({ note, onTrash }: { note: Note; onTrash?: () => void }) {
  const show = useSnackbar();
  const href = noteHref(note);
  return (
    <ActionsMenu
      items={[
        {
          label: 'Open',
          items: [
            { label: 'Here', href },
            { label: 'In a new tab', onSelect: () => window.open(href, '_blank', 'noopener,noreferrer') },
          ],
        },
        {
          label: 'Copy link',
          onSelect: () =>
            void navigator.clipboard.writeText(new URL(href, window.location.origin).href).then(
              () => show({ message: 'Copied the link.' }),
              () => show({ message: 'Could not copy the link', tone: 'error' }),
            ),
        },
        ...(onTrash ? [{ label: 'Move to trash', separated: true, onSelect: onTrash }] : []),
      ]}
      name={noteTitle(note)}
    />
  );
}
