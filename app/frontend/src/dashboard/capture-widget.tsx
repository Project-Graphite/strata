import { useState } from 'react';
import { Link } from 'react-router';
import { ListSkeleton, Select, TextAreaField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Note } from '../notes';
import { spaceOptions, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Hint } from '../components/Hint';
import { Button } from '../components/Button';
import { LoadError } from '../components/LoadError';
import { PageLinks } from './widget-parts';

export function Capture() {
  const auth = useAuth();
  const spaces = useSpaces();
  const notes = useResource<Note[]>('/me/notes?kind=quick', true, { live: ['items', 'pages'] });
  const saving = useAction();
  const [text, setText] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const target = spaceId || editable[0]?.id;

  if (spaces.data && editable.length === 0) return <Hint>You can only view your spaces, so there is nowhere to save.</Hint>;

  function save(kind: 'note' | 'task') {
    const content = text.trim();
    if (!content || !target) return;
    void saving.run(async () => {
      const [first, ...rest] = content.split(/\r?\n/);
      if (kind === 'note') {
        const body = rest.join('\n').trim();
        await auth.request(`/spaces/${target}/notes`, {
          method: 'POST',
          body: JSON.stringify({ title: first!.trim().slice(0, 200), quick: true, ...(body ? { text: body } : {}) }),
        });
        notes.reload();
      } else {
        await auth.request(`/spaces/${target}/tasks`, { method: 'POST', body: JSON.stringify({ title: first!.slice(0, 200) }) });
      }
      setText('');
      return kind === 'note' ? 'Saved as a note.' : 'Saved as a task.';
    }, 'Could not save that');
  }

  return (
    <div className="grid gap-2">
      <TextAreaField
        aria-label="Quick note"
        maxLength={10_000}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="Write it down…"
        rows={3}
        value={text}
      />
      <div className="flex flex-wrap items-center gap-2">
        {editable.length > 1 && (
          <Select aria-label="Save in" onChange={setSpaceId} options={spaceOptions(editable)} size="small" value={target ?? ''} />
        )}
        <Button disabled={!text.trim() || saving.busy} label="Save note" onClick={() => save('note')} />
        <Button disabled={!text.trim() || saving.busy} label="Save as task" onClick={() => save('task')} />
      </div>
      {notes.error ? (
        <LoadError compact error={notes.error} onRetry={notes.reload} />
      ) : !notes.data ? (
        <ListSkeleton label="Loading your notes" rows={3} />
      ) : notes.data.length === 0 ? (
        <Hint>No notes yet.</Hint>
      ) : (
        <PageLinks heading="Recent notes" pages={notes.data.slice(0, 3)} />
      )}
      <Link className="w-fit text-sm text-ink" to="/pages/quick-notes">
        All quick notes
      </Link>
    </div>
  );
}
