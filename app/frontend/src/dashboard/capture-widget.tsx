import { useState } from 'react';
import { useAuth } from '../auth';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { Empty } from './widget-parts';

export function Capture() {
  const auth = useAuth();
  const spaces = useSpaces();
  const saving = useAction();
  const [text, setText] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const target = spaceId || editable[0]?.id;

  if (spaces.data && editable.length === 0) return <Empty>You can only view your spaces, so there is nowhere to save.</Empty>;

  function save(kind: 'note' | 'task') {
    const content = text.trim();
    if (!content || !target) return;
    void saving.run(async () => {
      const [first, ...rest] = content.split(/\r?\n/);
      if (kind === 'note') {
        const body = rest.join('\n').trim();
        await auth.request(`/spaces/${target}/notes`, { method: 'POST', body: JSON.stringify({ title: first!.trim().slice(0, 200), ...(body ? { text: body } : {}) }) });
      } else {
        await auth.request(`/spaces/${target}/tasks`, { method: 'POST', body: JSON.stringify({ title: first!.slice(0, 200) }) });
      }
      setText('');
      return kind === 'note' ? 'Saved as a page.' : 'Saved as a task.';
    }, 'Could not save that');
  }

  return (
    <div className="grid gap-2">
      <textarea
        aria-label="Quick note"
        maxLength={10_000}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="Write it down…"
        rows={3}
        value={text}
      />
      <div className="flex flex-wrap items-center gap-2">
        {editable.length > 1 && (
          <select aria-label="Save in" className="text-sm" onChange={(event) => setSpaceId(event.currentTarget.value)} value={target}>
            {editable.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        )}
        <button className="secondary-button px-3 py-1.5 text-sm" disabled={!text.trim() || saving.busy} onClick={() => save('note')} type="button">
          Save as page
        </button>
        <button className="secondary-button px-3 py-1.5 text-sm" disabled={!text.trim() || saving.busy} onClick={() => save('task')} type="button">
          Save as task
        </button>
      </div>
    </div>
  );
}
