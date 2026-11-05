import { Icon, ListRow } from '@project-graphite/ui';
import { Section } from './Page';

export function NotificationsLink({ children }: { children: string }) {
  return (
    <Section title="Notifications">
      <ul className="panel-rows">
        <ListRow href="/settings/notifications" lead={<Icon name="bell" size={18} />} meta={children} title="Choose where these reach you" />
      </ul>
    </Section>
  );
}