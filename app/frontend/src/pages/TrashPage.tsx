import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog, EmptyState, ListSkeleton, PageHeader, Pagination, timeAgo } from '@project-graphite/ui';
import type { Page } from '../api';
import { useAuth } from '../auth';
import { useSpaces, type Item } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ItemList } from './spaces/ItemList';
import { LoadError } from '../components/LoadError';

export function TrashPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const trash = useResource<Page<Item>>(`/trash?page=${page}`, true);
  const action = useAction();
  const [deleting, setDeleting] = useState<Item>();
  const spaceName = (item: Item) => spaces.data?.find((space) => space.id === item.spaceId)?.name ?? 'a space';

  return (
    <section className="page-enter grid max-w-3xl gap-6">
      <PageHeader title="Trash">Items here are deleted for good after 30 days.</PageHeader>
      {trash.error ? (
        <LoadError error={trash.error} onRetry={trash.reload} />
      ) : !trash.data ? (
        <ListSkeleton label="Loading the trash" rows={4} />
      ) : trash.data.results.length === 0 ? (
        <EmptyState title="The trash is empty" />
      ) : (
        <>
          <ItemList
            actions={(item) => (
              <>
                <button
                  className="secondary-button px-3 py-2 text-sm"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await auth.request(`/items/${item.id}/restore`, { method: 'POST' });
                      trash.reload();
                      return `${item.title || 'Untitled'} is back in ${spaceName(item)}.`;
                    }, 'Could not restore that')
                  }
                  type="button"
                >
                  Restore
                </button>
                <button className="secondary-button px-3 py-2 text-sm" onClick={() => setDeleting(item)} type="button">
                  Delete
                </button>
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
    </section>
  );
}
