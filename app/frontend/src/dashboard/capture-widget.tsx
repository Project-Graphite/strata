import { useState } from 'react';
import { Select } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { spaceOptions, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { Hint } from '../components/Hint';
import { Button } from '../components/Button';

export function Capture() {
  const auth = useAuth();
  const spaces = useSpaces();
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
          <Select aria-label="Save in" onChange={setSpaceId} options={spaceOptions(editable)} size="small" value={target ?? ''} />
        )}
        <Button disabled={!text.trim() || saving.busy} label="Save as page" onClick={() => save('note')} />
        <Button disabled={!text.trim() || saving.busy} label="Save as task" onClick={() => save('task')} />
      </div>
    </div>
  );
}
