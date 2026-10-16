import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { TagChip } from '@project-graphite/ui';
import { FilePreview, hasPreview } from '../../files';
import { itemHref, itemKindName, type Item } from '../../spaces';
import { RowText } from '../../components/RowText';

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
      {items.map((item) => {
        const href = !item.trashedAt && itemHref(item);
        const content = (
          <>
            {hasPreview(item) && <FilePreview item={item} />}
            <RowText detail={`${itemKindName(item)} · ${detail(item)}`} title={item.title || 'Untitled'}>
              {item.tags.length > 0 && (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <TagChip color={tag.color} key={tag.id} label={tag.name} />
                  ))}
                </span>
              )}
            </RowText>
          </>
        );
        return (
          <li className={`flex items-center gap-2 pe-2 ${href ? 'hover:bg-line-soft' : ''}`} key={item.id}>
            {href ? (
              <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" to={href}>
                {content}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3 panel-row">{content}</div>
            )}
            {actions(item)}
          </li>
        );
      })}
    </ul>
  );
}
