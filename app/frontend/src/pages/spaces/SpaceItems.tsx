import { Link, useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton, Pagination, timeAgo } from '@project-graphite/ui';
import type { Page } from '../../api';
import { useAuth } from '../../auth';
import type { Item } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { ItemList } from './ItemList';
import { useSpace } from './SpaceLayout';

export function SpaceItems() {
  const auth = useAuth();
  const space = useSpace();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const archived = params.get('archived') === 'true';
  const items = useResource<Page<Item>>(
    `/spaces/${space.id}/items?page=${page}${archived ? '&archived=true' : ''}`,
    true,
  );
  const action = useAction();
  const base = `/spaces/${space.id}`;

  if (items.error) return <p className="error-message">{items.error}</p>;
  if (!items.data) return <ListSkeleton label="Loading the items in this space" rows={4} />;

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      <Link className="mono-sm w-fit text-faint" to={archived ? base : `${base}?archived=true`}>
        {archived ? 'show current items' : 'show archived items'}
      </Link>
      {items.data.results.length === 0 ? (
        <EmptyState title={archived ? 'Nothing archived' : 'Nothing here yet'}>
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            {archived
              ? 'Items you archive in this space are kept here.'
              : 'Notes, tasks and everything else you keep in this space will be listed here.'}
          </p>
        </EmptyState>
      ) : (
        <ItemList
          actions={(item) =>
            space.role !== 'viewer' && (
              <button
                className="secondary-button inline-flex px-3 py-2 text-sm"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await auth.request(`/items/${item.id}/trash`, { method: 'POST' });
                    items.reload();
                    return `${item.title || 'Untitled'} is in the trash.`;
                  }, 'Could not move that to the trash')
                }
                type="button"
              >
                Move to trash
              </button>
            )
          }
          detail={(item) => `updated ${timeAgo(item.updatedAt)}`}
          items={items.data.results}
        />
      )}
      {action.status}
      <Pagination
        page={items.data.page}
        pageHref={(next) => `${base}?page=${next}${archived ? '&archived=true' : ''}`}
        totalPages={items.data.totalPages}
      />
    </div>
  );
}
