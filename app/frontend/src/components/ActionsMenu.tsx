import { Icon, Menu, type MenuItem } from '@project-graphite/ui';

export function ActionsMenu({ items, name }: { items: MenuItem[]; name: string }) {
  return <Menu items={items} label={`${name} actions`} trigger={<Icon name="more" size={18} />} triggerClassName="icon-button" triggerLabel={`Actions for ${name}`} />;
}
