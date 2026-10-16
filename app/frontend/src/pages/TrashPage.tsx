import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog, ListSkeleton, Pagination, timeAgo } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { announcePagesChanged } from '../notes';
import { useSpaces, type Item } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ItemList } from './spaces/ItemList';
import { ActionsMenu } from '../components/ActionsMenu';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { Button } from '../components/Button';

export function TrashPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const trash = useResource<ResultPage<Item>>(`/trash?page=${page}`, true);
  const action = useAction();
  const [deleting, setDeleting] = useState<Item>();
  const spaceName = (item: Item) => spaces.data?.find((space) => space.id === item.spaceId)?.name ?? 'a space';

  return (
    <Page description="Items here are deleted for good after 30 days." title="Trash">
      {trash.error ? (
        <LoadError error={trash.error} onRetry={trash.reload} />
      ) : !trash.data ? (
        <ListSkeleton label="Loading the trash" rows={4} />
      ) : trash.data.results.length === 0 ? (
        <Empty title="The trash is empty" />
      ) : (
        <>
          <ItemList
            actions={(item) => (
              <>
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
                <ActionsMenu items={[{ label: 'Delete', onSelect: () => setDeleting(item) }]} name={item.title || 'Untitled'} />
              </>
            )}
            detail={(item) => `${spaceName(item)} · trashed ${timeAgo(item.trashedAt!)}`}
            items={trash.data.results}
          />
          <Pagination page={trash.data.page} pageHref={(next) => `/trash?page=${next}`} totalPages={trash.data.totalPages} />
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
          }}
          title={`Delete ${deleting.title || 'Untitled'} for good?`}
        >
          It is removed for everyone in {spaceName(deleting)}. This cannot be undone.
        </ConfirmDialog>
      )}
    </Page>
  );
}
