import ListItemButton from '@mui/material/ListItemButton';
import { useState } from 'react';
import { Dialog, Placeholder, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from './LoadError';
import { Hint } from './Hint';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { HintSkeleton, rowsOf, SkeletonLine, useRememberedShape } from './Skeletons';

interface Version {
  id: string;
  createdAt: string;
  createdBy: string | null;
}

export function NoteHistory({ editable, noteId, onClose }: { editable: boolean; noteId: string; onClose: () => void }) {
  const auth = useAuth();
  const versions = useResource<Version[]>(`/notes/${noteId}/versions`, true);
  const [chosen, setChosen] = useState<string>();
  const preview = useResource<{ id: string; text: string }>(chosen ? `/notes/${noteId}/versions/${chosen}` : null, true);
  const restoring = useAction();
  const [rows] = useRememberedShape('note-history', versions.data && [versions.data.length], [3]);

  return (
    <Dialog onClose={onClose} title="Page history">
      <div className="mt-5 grid gap-4">
        {versions.error ? (
          <LoadError error={versions.error} onRetry={versions.reload} />
        ) : !versions.data ? (
          <Placeholder label="Loading the history">
            {rows ? (
              <ul aria-hidden="true" className="panel-rows max-h-56 overflow-hidden">
                {rowsOf(rows).map((row) => (
                  <li className="flex justify-between gap-3 px-4 py-2 text-sm" key={row}>
                    <SkeletonLine width={row % 2 ? 'w-32' : 'w-36'} />
                    <SkeletonLine width="w-28" />
                  </li>
                ))}
              </ul>
            ) : (
              <HintSkeleton />
            )}
          </Placeholder>
        ) : versions.data.length === 0 ? (
          <Hint>No earlier versions yet.</Hint>
        ) : (
          <>
            <ul className="panel-rows max-h-56 overflow-y-auto">
              {versions.data.map((version) => (
                <li key={version.id}>
                  <ListItemButton
                    aria-pressed={chosen === version.id}
                    className="justify-between gap-3 text-sm"
                    onClick={() => setChosen(version.id)}
                    selected={chosen === version.id}
                  >
                    <span>{new Date(version.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span className="text-faint">
                      {version.createdBy ?? 'Someone'} · {timeAgo(version.createdAt)}
                    </span>
                  </ListItemButton>
                </li>
              ))}
            </ul>
            {chosen &&
              (preview.error ? (
                <LoadError compact error={preview.error} onRetry={preview.reload} />
              ) : !preview.data || preview.data.id !== chosen ? (
                <Placeholder className="rounded-field border border-line p-4 text-sm" label="Loading this version">
                  <SkeletonLine width="w-full" />
                  <SkeletonLine width="w-full" />
                  <SkeletonLine width="w-1/2" />
                </Placeholder>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-field border border-line p-4 text-sm whitespace-pre-wrap break-words text-ink">
                  {preview.data.text || 'This version is empty.'}
                </div>
              ))}
          </>
        )}
        <DialogActions>
          <Button label="Done" large onClick={onClose} />
          {editable && (
            <Button
              disabled={!chosen || restoring.busy}
              label={restoring.busy ? 'Restoring…' : 'Restore this version'}
              large
              onClick={() =>
                void restoring
                  .run(async () => {
                    await auth.request(`/notes/${noteId}/versions/${chosen}/restore`, { method: 'POST' });
                    return 'Restored. The page as it was just before is kept in the history.';
                  }, 'Could not restore that version')
                  .then((done) => done && onClose())
              }
              primary
            />
          )}
        </DialogActions>
      </div>
    </Dialog>
  );
}
