import { Icon } from '@project-graphite/ui';
import type { Note } from '../notes';

export function NoteMark({ note }: { note: Pick<Note, 'icon' | 'kind'> }) {
  return (
    <span aria-hidden="true" className="note-mark">
      {note.icon ?? <Icon name={note.kind === 'board' ? 'board' : 'file'} size={18} />}
    </span>
  );
}
