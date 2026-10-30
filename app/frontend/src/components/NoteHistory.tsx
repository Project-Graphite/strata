import { useState } from 'react';
import { Card, Dialog, ListRow, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { capitalised, formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from './LoadError';
import { Hint } from './Hint';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { HintSkeleton, RowsSkeleton, SkeletonLine, useRememberedShape } from './Skeletons';

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
              <RowsSkeleton rows={rows} />
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
                <ListRow
                  key={version.id}
                  meta={version.createdBy ?? 'Someone'}
                  onClick={() => setChosen(version.id)}
                  selected={chosen === version.id}
                  title={capitalised(formatMoment(version.createdAt))}
                />
              ))}
            </ul>
            {chosen &&
              (preview.error ? (
                <LoadError compact error={preview.error} onRetry={preview.reload} />
              ) : !preview.data || preview.data.id !== chosen ? (
                <Placeholder label="Loading this version">
                  <Card className="text-body">
                    <SkeletonLine width="w-full" />
                    <SkeletonLine width="w-full" />
                    <SkeletonLine width="w-1/2" />
                  </Card>
                </Placeholder>
              ) : (
                <Card className="max-h-56 overflow-y-auto text-body whitespace-pre-wrap break-words text-ink">{preview.data.text || 'This version is empty.'}</Card>
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
