import { Link, useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton, Pagination, timeAgo } from '@project-graphite/ui';
import { readBlob, type Page } from '../../api';
import { useAuth } from '../../auth';
import { fileSize, maxUploadBytes, preparedUpload, saveBlob } from '../../files';
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
  const tag = params.get('tag');
  const filters = `${archived ? '&archived=true' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`;
  const items = useResource<Page<Item>>(`/spaces/${space.id}/items?page=${page}${filters}`, true);
  const action = useAction();
  const uploading = useAction();
  const base = `/spaces/${space.id}`;
  const editable = space.role !== 'viewer';

  function upload(files: File[]) {
    void uploading.run(async () => {
      const accepted = files.filter((file) => file.size <= maxUploadBytes);
      const refused = files.filter((file) => file.size > maxUploadBytes);
      for (const file of accepted) {
        await auth.request(`/spaces/${space.id}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
          body: await preparedUpload(file),
        });
      }
      items.reload();
      return [
        accepted.length === 1 ? `Added ${accepted[0]!.name}.` : accepted.length ? `Added ${accepted.length} files.` : '',
        refused.length ? `${refused.map((file) => file.name).join(', ')} ${refused.length === 1 ? 'is' : 'are'} over 25 MB.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }, 'Could not upload that file');
  }

  if (items.error) return <p className="error-message">{items.error}</p>;
  if (!items.data) return <ListSkeleton label="Loading the items in this space" rows={4} />;

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <Link className="mono-sm w-fit text-faint" to={archived ? base : `${base}?archived=true`}>
            {archived ? 'show current items' : 'show archived items'}
          </Link>
          {tag && (
            <Link className="mono-sm w-fit text-faint" to={base}>
              showing one tag · show everything
            </Link>
          )}
        </div>
        {editable && !archived && (
          <label className={`secondary-button inline-flex cursor-pointer px-3 py-2 text-sm ${uploading.busy ? 'opacity-60' : ''}`}>
            {uploading.busy ? 'Uploading…' : 'Upload files'}
            <input
              className="sr-only"
              disabled={uploading.busy}
              multiple
              onChange={(event) => {
                const chosen = [...(event.currentTarget.files ?? [])];
                event.currentTarget.value = '';
                if (chosen.length) upload(chosen);
              }}
              type="file"
            />
          </label>
        )}
      </div>
      {uploading.status}
      {items.data.results.length === 0 ? (
        <EmptyState title={archived ? 'Nothing archived' : 'Nothing here yet'}>
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            {archived
              ? 'Items you archive in this space are kept here.'
              : 'Files, notes, tasks and everything else you keep in this space will be listed here.'}
          </p>
        </EmptyState>
      ) : (
        <ItemList
          actions={(item) => (
            <>
              {item.file && (
                <button
                  className="secondary-button inline-flex px-3 py-2 text-sm"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      saveBlob(await auth.request<Blob>(`/files/${item.id}`, {}, readBlob), item.title);
                      return '';
                    }, 'Could not download that file')
                  }
                  type="button"
                >
                  Download
                </button>
              )}
              {editable && (
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
              )}
            </>
          )}
          detail={(item) =>
            [item.file && fileSize(item.file.sizeBytes), `updated ${timeAgo(item.updatedAt)}`].filter(Boolean).join(' · ')
          }
          items={items.data.results}
        />
      )}
      {action.status}
      <Pagination
        page={items.data.page}
        pageHref={(next) => `${base}?page=${next}${filters}`}
        totalPages={items.data.totalPages}
      />
    </div>
  );
}
