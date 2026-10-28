import type { ReactNode } from 'react';
import { ListRow, Skeleton, TagChip } from '@project-graphite/ui';
import { FilePreview, hasPreview } from '../../files';
import { itemHref, itemKindName, type Item } from '../../spaces';
import { rowsOf, RowSkeleton } from '../../components/Skeletons';

export const itemsShape = (items: Item[]): [number, number, number] => [items.length, items.filter(hasPreview).length, items.filter((item) => item.tags.length > 0).length];

export function ItemRowsSkeleton({ shape: [rows, previews, tagged] }: { shape: [number, number, number] }) {
  return (
    <ul aria-hidden="true" className="panel-rows">
      {rowsOf(rows).map((row) => (
        <RowSkeleton
          below={
            row < tagged && (
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
              </span>
            )
          }
          key={row}
          lead={row < previews && <Skeleton className="h-14 w-14 shrink-0 rounded-field" />}
          row={row}
        />
      ))}
    </ul>
  );
}

export function ItemList({
  actions,
  detail,
  items,
}: {
  actions: (item: Item) => ReactNode;
  detail: (item: Item) => string;
  items: Item[];
}) {
  return (
    <ul className="panel-rows">
      {items.map((item) => (
        <ListRow
          href={(!item.trashedAt && itemHref(item)) || undefined}
          key={item.id}
          lead={hasPreview(item) && <FilePreview item={item} />}
          meta={`${itemKindName(item)} · ${detail(item)}`}
          title={item.title || 'Untitled'}
          trail={actions(item)}
        >
          {item.tags.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <TagChip color={tag.color} key={tag.id} label={tag.name} />
              ))}
            </span>
          )}
        </ListRow>
      ))}
    </ul>
  );
}
