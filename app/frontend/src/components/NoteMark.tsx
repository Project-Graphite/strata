import { Icon } from '@project-graphite/ui';
import { noteTitle, type Note } from '../notes';

export function NoteTitle({ note }: { note: Pick<Note, 'draft' | 'title'> }) {
  return (
    <>
      {noteTitle(note)}
      {note.draft && <span className="note-draft"> (draft)</span>}
    </>
  );
}

export function NoteMark({ note }: { note: Pick<Note, 'icon' | 'kind'> }) {
  return (
    <span aria-hidden="true" className="note-mark">
      {note.icon ?? <Icon name={note.kind === 'board' ? 'board' : 'file'} size={18} />}
    </span>
  );
}
