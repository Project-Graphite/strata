import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog, Pagination, Placeholder } from '@project-graphite/ui';
import type { Page as ResultPage } from '../../api';
import { useAuth } from '../../auth';
import { announcePagesChanged } from '../../notes';
import { useAllSpaces, type Item } from '../../spaces';
import { formatMoment } from '../../time';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { ItemList, ItemRowsSkeleton, itemsShape } from '../spaces/ItemList';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { Button } from '../../components/Button';
import { useRememberedShape } from '../../components/Skeletons';

const empty = { title: 'The trash is empty', hint: 'Anything you move to the trash waits here until you restore it.' };

export function TrashSettings() {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const trash = useResource<ResultPage<Item>>(`/trash?page=${page}`, true);
  const action = useAction();
  const [deleting, setDeleting] = useState<Item>();
  const spaceName = (item: Item) => spaces.data?.find((space) => space.id === item.spaceId)?.name ?? 'a space';
  const shape = useRememberedShape('settings-trash', trash.data && itemsShape(trash.data.results), [4, 0, 0]);

  return (
    <Section description="Items here are deleted for good after 30 days." title="Trash">
      {trash.error ? (
        <LoadError error={trash.error} onRetry={trash.reload} />
      ) : !trash.data ? (
        <Placeholder label="Loading the trash">
          {shape[0] ? (
            <ItemRowsSkeleton shape={shape} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : trash.data.results.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <>
          <ItemList
            actions={(item) => (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  disabled={action.busy}
                  label="Restore"
                  onClick={() =>
                    void action.run(async () => {
                      await auth.request(`/items/${item.id}/restore`, { method: 'POST' });
                      trash.reload();
                      if (item.kind === 'note' || item.kind === 'board') announcePagesChanged();
                      return `${item.title || 'Untitled'} is back in ${spaceName(item)}.`;
                    }, 'Could not restore that')
                  }
                />
                <ActionsMenu items={[{ label: 'Delete for good', onSelect: () => setDeleting(item) }]} name={item.title || 'Untitled'} />
              </div>
            )}
            detail={(item) => `${spaceName(item)} · trashed ${formatMoment(item.trashedAt!)}`}
            items={trash.data.results}
          />
          <Pagination page={trash.data.page} pageHref={(next) => `/settings/trash?page=${next}`} totalPages={trash.data.totalPages} />
        </>
      )}

      {deleting && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel="Delete for good"
          errorFallback="Could not delete that"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await auth.request(`/items/${deleting.id}`, { method: 'DELETE' });
            trash.reload();
            action.report(`Deleted ${deleting.title || 'Untitled'}.`);
          }}
          title={`Delete ${deleting.title || 'Untitled'} for good?`}
          tone="danger"
        >
          It’s removed for everyone in {spaceName(deleting)}, and this can’t be undone.
        </ConfirmDialog>
      )}
    </Section>
  );
}
