import type { ReactNode } from 'react';
import { TagChip } from '@project-graphite/ui';
import type { Item } from '../../spaces';

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
    <ul className="m-0 grid list-none gap-0 p-0">
      {items.map((item) => (
        <li className="flex items-center justify-between gap-4 border-b border-line-soft py-4" key={item.id}>
          <div className="min-w-0">
            <p className="m-0 truncate text-ink">{item.title || 'Untitled'}</p>
            <p className="mono-sm m-0 mt-1 text-faint">
              {item.kind} · {detail(item)}
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
