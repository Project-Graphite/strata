import { useEffect, useState } from 'react';
import { Banner, Dialog, errorMessage, isAbortError, ListRow, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Tag } from '../spaces';
import { useAction } from '../useAction';
import { Button } from './Button';
import { DialogActions } from './DialogActions';
import { Subheading } from './Page';
import { ButtonSkeleton, RowsSkeleton, SkeletonLine, useRememberedShape } from './Skeletons';

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
  rule: { id: string; titleContains: string; fileType: string | null } | null;
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

const confirmLabels: Record<TidyAction, { label: string; busy: string }> = {
  archive: { label: 'Archive', busy: 'Archiving…' },
  trash: { label: 'Move to trash', busy: 'Moving…' },
  tag: { label: 'Add the tag', busy: 'Adding…' },
  cancel: { label: 'Cancel them', busy: 'Cancelling…' },
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
  const [changeRows, skippedRows] = useRememberedShape('tidy-preview', preview && [preview.changes.length, preview.skipped.length], [3, 0]);

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
    <Dialog onClose={onClose} title="Check before you tidy">
      <div className="mt-5 grid gap-6">
        {error ? (
          <Banner tone="danger">{error}</Banner>
        ) : !preview ? (
          <Placeholder className="grid gap-6" label="Checking the items">
            {changeRows ? (
              <div className="grid gap-2">
                <SkeletonLine className="text-small" width="w-56" />
                <div className="max-h-60 overflow-hidden rounded-panel">
                  <RowsSkeleton detail={false} rows={changeRows} />
                </div>
              </div>
            ) : (
              <SkeletonLine width="w-48" />
            )}
            {skippedRows > 0 && (
              <div className="grid gap-2">
                <SkeletonLine className="text-small" width="w-48" />
                <div className="max-h-40 overflow-hidden rounded-panel">
                  <RowsSkeleton rows={skippedRows} />
                </div>
              </div>
            )}
          </Placeholder>
        ) : (
          <>
            {preview.changes.length > 0 ? (
              <section className="grid gap-2">
                <Subheading>{changeHeading(request.action, preview.changes.length)}</Subheading>
                <ul className="panel-rows max-h-60 overflow-y-auto">
                  {preview.changes.map((change) => (
                    <ListRow key={change.id} title={change.title || 'Untitled'} />
                  ))}
                </ul>
              </section>
            ) : (
              <p className="m-0 text-muted">Nothing here will change.</p>
            )}
            {preview.skipped.length > 0 && (
              <section className="grid gap-2">
                <Subheading>{itemsText(preview.skipped.length)} will be left alone</Subheading>
                <ul className="panel-rows max-h-40 overflow-y-auto">
                  {preview.skipped.map((entry) => (
                    <ListRow key={entry.id} meta={entry.reason} title={entry.title || 'An item you can’t open'} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <DialogActions>
          <Button disabled={applying.busy} label="Cancel" large onClick={onClose} />
          {!preview && !error && changeRows > 0 && <ButtonSkeleton large width="w-32" />}
          {preview && preview.changes.length > 0 && (
            <Button
              disabled={applying.busy}
              label={applying.busy ? confirmLabels[request.action].busy : confirmLabels[request.action].label}
              large
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
              primary
            />
          )}
        </DialogActions>
      </div>
    </Dialog>
  );
}
