import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { TagChip } from '@project-graphite/ui';
import { FilePreview, hasPreview } from '../../files';
import { itemHref, itemKindName, type Item } from '../../spaces';

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
        <li className="flex items-center justify-between gap-4 panel-row" key={item.id}>
          {hasPreview(item) && <FilePreview item={item} />}
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-ink">
              {!item.trashedAt && itemHref(item) ? (
                <Link className="text-ink no-underline hover:underline" to={itemHref(item)!}>
                  {item.title || 'Untitled'}
                </Link>
              ) : (
                item.title || 'Untitled'
              )}
            </p>
            <p className="mono-sm m-0 mt-1 text-faint">
              {itemKindName(item.kind)} · {detail(item)}
            </p>
            {item.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <TagChip color={tag.color} key={tag.id} label={tag.name} />
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">{actions(item)}</div>
        </li>
      ))}
    </ul>
  );
}
