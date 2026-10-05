import { useState } from 'react';
import { Dialog, EmptyState, ListSkeleton, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { LoadError } from './LoadError';

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

  return (
    <Dialog onClose={onClose} title="Page history">
      <div className="mt-5 grid gap-4">
        {versions.error ? (
          <LoadError error={versions.error} onRetry={versions.reload} />
        ) : !versions.data ? (
          <ListSkeleton label="Loading the history" rows={3} />
        ) : versions.data.length === 0 ? (
          <EmptyState title="No earlier versions yet" />
        ) : (
          <>
            <ul className="panel-rows m-0 grid max-h-56 list-none overflow-y-auto p-0">
              {versions.data.map((version) => (
                <li key={version.id}>
                  <button
                    aria-pressed={chosen === version.id}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${chosen === version.id ? 'bg-line-soft text-ink' : 'text-muted hover:text-ink'}`}
                    onClick={() => setChosen(version.id)}
                    type="button"
                  >
                    <span>{new Date(version.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span className="mono-sm text-faint">
                      {version.createdBy ?? 'someone'} · {timeAgo(version.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {chosen &&
              (preview.error ? (
                <LoadError compact error={preview.error} onRetry={preview.reload} />
              ) : !preview.data || preview.data.id !== chosen ? (
                <ListSkeleton label="Loading this version" rows={2} />
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-line p-4 text-sm whitespace-pre-wrap text-ink">
                  {preview.data.text || 'This version is empty.'}
                </div>
              ))}
            <div className="flex justify-end gap-3">
              <button className="secondary-button" onClick={onClose} type="button">
                Close
              </button>
              {editable && (
                <button
                  className="primary-button"
                  disabled={!chosen || restoring.busy}
                  onClick={() =>
                    void restoring
                      .run(async () => {
                        await auth.request(`/notes/${noteId}/versions/${chosen}/restore`, { method: 'POST' });
                        return 'Restored. The page as it was just before is kept in the history.';
                      }, 'Could not restore that version')
                      .then((done) => done && onClose())
                  }
                  type="button"
                >
                  {restoring.busy ? 'Restoring…' : 'Restore this version'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
