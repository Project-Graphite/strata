import { Icon } from '@project-graphite/ui';
import { NestedMenu, type NestedMenuItem } from './NestedMenu';

export function ActionsMenu({ items, name }: { items: NestedMenuItem[]; name: string }) {
  return <NestedMenu items={items} label={`${name} actions`} trigger={<Icon name="more" size={18} />} triggerLabel={`Actions for ${name}`} />;
}
