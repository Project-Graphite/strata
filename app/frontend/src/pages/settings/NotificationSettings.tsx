import { DevicePush } from '../../components/DevicePush';
import { Section } from '../../components/Page';

export function NotificationSettings() {
  return (
    <Section description="Strata keeps every notification in the bell. Choose what also reaches this device." title="This device">
      <DevicePush />
    </Section>
  );
}
