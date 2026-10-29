import { useNavigate, useSearchParams } from 'react-router';
import { Pagination, Placeholder, TagChip, timeAgo, type MenuItem } from '@project-graphite/ui';
import { readBlob, type Page } from '../../api';
import { useAuth } from '../../auth';
import { fileSize, saveBlob, uploadFiles } from '../../files';
import type { Item, Tag } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { ItemList, ItemRowsSkeleton, itemsShape } from './ItemList';
import { useSpace } from './SpaceLayout';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Empty } from '../../components/Empty';
import { FileButton } from '../../components/FileButton';
import { LoadError } from '../../components/LoadError';
import { FilterChips, Toolbar } from '../../components/Page';
import { useRememberedShape } from '../../components/Skeletons';

export function SpaceItems() {
  const auth = useAuth();
  const space = useSpace();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(params.get('page')) || 1;
  const archived = params.get('archived') === 'true';
  const tag = params.get('tag');
  const filters = `${archived ? '&archived=true' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`;
  const items = useResource<Page<Item>>(`/spaces/${space.id}/items?page=${page}${filters}`, true);
  const tags = useResource<Tag[]>(tag ? `/spaces/${space.id}/tags` : null, true);
  const action = useAction();
  const uploading = useAction();
  const base = `/spaces/${space.id}/items`;
  const editable = space.role !== 'viewer';
  const tagName = tags.data?.find((shown) => shown.id === tag)?.name ?? 'Tag';
  const shape = useRememberedShape(`space-items-${space.id}${filters}`, items.data && itemsShape(items.data.results), [4, 0, 0]);
  const empty = archived
    ? { title: 'Nothing archived yet', hint: 'Things you archive in this space wait here.' }
    : { title: 'Nothing here yet', hint: 'Pages, tasks, files and everything else you add to this space show up here.' };
  const link = (next: { archived?: boolean; tag?: null; page?: number }) => {
    const query = new URLSearchParams();
    if (next.archived ?? archived) query.set('archived', 'true');
    if (tag && next.tag !== null) query.set('tag', tag);
    if (next.page && next.page > 1) query.set('page', String(next.page));
    return `${base}${query.size ? `?${query}` : ''}`;
  };

  function upload(files: File[]) {
    void uploading.run(async () => {
      const message = await uploadFiles(auth.request, space.id, files);
      items.reload();
      return message;
    }, 'Could not upload those files');
  }

  function actionsFor(item: Item): MenuItem[] {
    return [
      ...(item.file
        ? [
            {
              label: 'Download',
              onSelect: () =>
                void action.run(async () => {
                  saveBlob(await auth.request<Blob>(`/files/${item.id}`, {}, readBlob), item.title);
                  return '';
                }, 'Could not download that file'),
            },
          ]
        : []),
      ...(editable
        ? [
            {
              label: 'Move to trash',
              separated: Boolean(item.file),
              onSelect: () =>
                void action.run(async () => {
                  await auth.request(`/items/${item.id}/trash`, { method: 'POST' });
                  items.reload();
                  return {
                    message: `Moved ${item.title || 'Untitled'} to the trash.`,
                    undo: async () => {
                      await auth.request(`/items/${item.id}/restore`, { method: 'POST' });
                      items.reload();
                      return '';
                    },
                  };
                }, 'Could not move that to the trash'),
            },
          ]
        : []),
    ];
  }

  return (
    <>
      <Toolbar actions={editable && !archived && <FileButton busy={uploading.busy} label={uploading.busy ? 'Uploading…' : 'Upload files'} multiple onFiles={upload} />}>
        <FilterChips
          items={[
            { active: !archived, href: link({ archived: false }), label: 'Current' },
            { active: archived, href: link({ archived: true }), label: 'Archived' },
          ]}
          label="Items"
        >
          {tag && <TagChip href={link({ tag: null })} label={tagName} onRemove={() => navigate(link({ tag: null }))} />}
        </FilterChips>
      </Toolbar>
      {items.error ? (
        <LoadError error={items.error} onRetry={items.reload} />
      ) : !items.data ? (
        <Placeholder label="Loading the items in this space">
          {shape[0] ? (
            <ItemRowsSkeleton shape={shape} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : items.data.results.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <>
          <ItemList
            actions={(item) => {
              const menu = actionsFor(item);
              return menu.length > 0 && <ActionsMenu items={menu} name={item.title || 'Untitled'} />;
            }}
            detail={(item) => [item.file && fileSize(item.file.sizeBytes), `updated ${timeAgo(item.updatedAt)}`].filter(Boolean).join(' · ')}
            items={items.data.results}
          />
          <Pagination page={items.data.page} pageHref={(next) => link({ page: next })} totalPages={items.data.totalPages} />
        </>
      )}
    </>
  );
}
