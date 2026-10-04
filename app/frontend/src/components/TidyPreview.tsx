import { useEffect, useState } from 'react';
import { Dialog, ListSkeleton, errorMessage, isAbortError } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Tag } from '../spaces';
import { useAction } from '../useAction';

export type TidyAction = 'archive' | 'trash' | 'tag' | 'cancel';

export interface TidyRequest {
  action: TidyAction;
  itemIds: string[];
  tagId?: string;
}

export interface TidyBatch {
  id: string;
  action: TidyAction;
  tag: Tag | null;
  rule: { id: string; titleContains: string } | null;
  itemCount: number;
  remaining: number;
  createdAt: string;
  undoneAt: string | null;
}

interface Skipped {
  id: string;
  title: string | null;
  reason: string;
}

interface Preview {
  changes: { id: string; spaceId: string; kind: string; title: string }[];
  skipped: Skipped[];
}

const confirmLabels: Record<TidyAction, string> = {
  archive: 'Archive',
  trash: 'Move to the trash',
  tag: 'Add the tag',
  cancel: 'Cancel them',
};

export const itemsText = (count: number) => `${count} item${count === 1 ? '' : 's'}`;

export function batchSummary(batch: TidyBatch) {
  if (batch.action === 'archive') return `Archived ${itemsText(batch.itemCount)}`;
  if (batch.action === 'trash') return `Moved ${itemsText(batch.itemCount)} to the trash`;
  if (batch.action === 'cancel') return `Cancelled ${batch.itemCount} subscription${batch.itemCount === 1 ? '' : 's'}`;
  return `Tagged ${itemsText(batch.itemCount)} ${batch.tag ? batch.tag.name : 'with a tag that was since deleted'}`;
}

export function undoSummary(result: { restored: number; skipped: Skipped[] }) {
  const left = result.skipped
    .map((entry) => `${entry.title || 'an item you can no longer open'} (${entry.reason.toLowerCase()})`)
    .join(', ');
  return `Undone for ${itemsText(result.restored)}.${left ? ` Left as they are: ${left}.` : ''}`;
}

function changeHeading(action: TidyAction, count: number) {
  if (action === 'archive') return `${itemsText(count)} will be archived`;
  if (action === 'trash') return `${itemsText(count)} will move to the trash, which keeps items for 30 days`;
  if (action === 'cancel') return `${count} subscription${count === 1 ? '' : 's'} will be cancelled`;
  return `${itemsText(count)} will get the tag`;
}

export function TidyPreview({
  request,
  onClose,
  onApplied,
}: {
  request: TidyRequest;
  onClose: () => void;
  onApplied: (batch: TidyBatch | null) => void;
}) {
  const { request: send } = useAuth();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const applying = useAction();

  useEffect(() => {
    const controller = new AbortController();
    send<Preview>('/tidy/preview', { method: 'POST', body: JSON.stringify(request), signal: controller.signal })
      .then(setPreview)
      .catch((reason: unknown) => {
        if (!isAbortError(reason)) setError(errorMessage(reason, 'Could not check these items'));
      });
    return () => controller.abort();
  }, [send, request]);

  return (
    <Dialog eyebrow="tidy" onClose={onClose} title="Check before you tidy">
      {error ? (
        <p className="error-message mt-5">{error}</p>
      ) : !preview ? (
        <ListSkeleton label="Checking the items" rows={3} />
      ) : (
        <div className="mt-5 grid gap-6">
          {preview.changes.length > 0 ? (
            <section>
              <h3 className="m-0 text-base font-medium">{changeHeading(request.action, preview.changes.length)}</h3>
              <ul className="mt-2 grid max-h-60 list-none gap-0 overflow-y-auto p-0">
                {preview.changes.map((change) => (
                  <li className="truncate border-b border-line-soft py-2 text-ink" key={change.id}>
                    {change.title || 'Untitled'}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="m-0 text-muted">Nothing here will change.</p>
          )}
          {preview.skipped.length > 0 && (
            <section>
              <h3 className="m-0 text-base font-medium">{itemsText(preview.skipped.length)} will be left alone</h3>
              <ul className="mt-2 grid max-h-40 list-none gap-0 overflow-y-auto p-0">
                {preview.skipped.map((entry) => (
                  <li className="truncate border-b border-line-soft py-2 text-ink" key={entry.id}>
                    {entry.title || 'An item you cannot open'} <span className="mono-sm text-faint">· {entry.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {applying.status}
          <div className="flex justify-end gap-3">
            <button className="secondary-button" onClick={onClose} type="button">
              Close
            </button>
            {preview.changes.length > 0 && (
              <button
                className="primary-button"
                disabled={applying.busy}
                onClick={() =>
                  void applying.run(async () => {
                    const applied = await send<{ batch: TidyBatch | null }>('/tidy/apply', {
                      method: 'POST',
                      body: JSON.stringify(request),
                    });
                    onApplied(applied.batch);
                    return '';
                  }, 'Could not tidy these items')
                }
                type="button"
              >
                {applying.busy ? 'Working…' : confirmLabels[request.action]}
              </button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
