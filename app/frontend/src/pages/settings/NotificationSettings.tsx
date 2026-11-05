import Checkbox from '@mui/material/Checkbox';
import { Icon, IconButton, ListRow, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { DevicePush, useDevicePush } from '../../components/DevicePush';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { RowsSkeleton } from '../../components/Skeletons';
import { channelOn, channels, notificationGroups, notificationKinds, withChannels, type Channel, type ChannelState, type NotificationKind } from '../../notifications';
import { formatMoment } from '../../time';
import { useAction } from '../../useAction';
import { useResource, type Resource } from '../../useResource';
import type { Me } from './SettingsLayout';

interface PushDevice {
  id: string;
  browser: string;
  kinds: string[];
  createdAt: string;
  lastUsedAt: string;
}

const securityKinds = ['Sign-ins from a new device', 'Password changes', 'Two-step sign-in changes'];

function Cell({ checked, disabled, indeterminate = false, label, onChange }: { checked: boolean; disabled?: boolean; indeterminate?: boolean; label: string; onChange?: (on: boolean) => void }) {
  return (
    <td className="matrix-cell">
      <Checkbox checked={checked} disabled={disabled || !onChange} indeterminate={indeterminate} onChange={(event) => onChange?.(event.target.checked)} size="small" slotProps={{ input: { 'aria-label': label } }} title={label} />
    </td>
  );
}

function Matrix({ mine, push }: { mine: Resource<Me>; push: ReturnType<typeof useDevicePush> }) {
  const auth = useAuth();
  const saving = useAction();
  const me = mine.data!;
  const state: ChannelState = {
    inboxMuted: me.inboxMuted,
    emailKinds: me.emailKinds,
    deviceKinds: push.kinds,
    reminders: { weeklyReview: me.weeklyReview, tidySummary: me.tidySummary, journalReminder: me.journalReminder },
  };
  const usable = (entry: NotificationKind, channel: Channel) => (channel === 'email' ? entry.emailed !== false : channel === 'device' ? push.kinds !== null : true);

  function change(changes: { entry: NotificationKind; channel: Channel; on: boolean }[], message: string) {
    const wanted = changes.filter(({ entry, channel }) => usable(entry, channel));
    if (wanted.length === 0) return;
    const next = withChannels(state, wanted);
    const before = me;
    mine.mutate((current) => ({ ...current, inboxMuted: next.inboxMuted, emailKinds: next.emailKinds, ...next.reminders }));
    void saving
      .run(async () => {
        if (next.deviceKinds && JSON.stringify(next.deviceKinds) !== JSON.stringify(push.kinds)) await push.saveKinds(next.deviceKinds);
        const saved = await auth.request<Me>('/me', { method: 'PATCH', body: JSON.stringify({ inboxMuted: next.inboxMuted, emailKinds: next.emailKinds, ...next.reminders }) });
        mine.mutate(() => saved);
        return message;
      }, 'Could not change the notifications')
      .then((done) => done || mine.mutate(() => before));
  }

  const summary = (kinds: NotificationKind[], channel: Channel) => {
    const open = kinds.filter((entry) => usable(entry, channel));
    const on = open.filter((entry) => channelOn(state, entry, channel)).length;
    return { all: open.length > 0 && on === open.length, some: on > 0 && on < open.length, none: open.length === 0 };
  };

  return (
    <div className="matrix-scroll">
      <table className="notification-matrix">
        <caption className="sr-only">Which notifications reach you, and where</caption>
        <thead>
          <tr>
            <th scope="col">Notification</th>
            {channels.map((channel) => {
              const shown = summary(notificationKinds, channel.key);
              return (
                <th key={channel.key} scope="col">
                  <span className="matrix-channel">{channel.label}</span>
                  <Checkbox
                    checked={shown.all}
                    disabled={shown.none || saving.busy}
                    indeterminate={shown.some}
                    onChange={(event) => change(notificationKinds.map((entry) => ({ entry, channel: channel.key, on: event.target.checked })), `${channel.label}: all ${event.target.checked ? 'on' : 'off'}.`)}
                    size="small"
                    slotProps={{ input: { 'aria-label': `All notifications ${channel.label.toLowerCase()}` } }}
                    title={`All notifications ${channel.label.toLowerCase()}`}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        {notificationGroups.map((group) => (
          <tbody key={group.key}>
            <tr className="matrix-group">
              <th scope="rowgroup">
                <span className="matrix-label">
                  <Icon name={group.icon} size={16} />
                  {group.label}
                </span>
              </th>
              {channels.map((channel) => {
                const shown = summary(group.kinds, channel.key);
                return shown.none ? (
                  <td className="matrix-cell" key={channel.key} />
                ) : (
                  <Cell
                    checked={shown.all}
                    disabled={saving.busy}
                    indeterminate={shown.some}
                    key={channel.key}
                    label={`${group.label}, ${channel.label.toLowerCase()}`}
                    onChange={(on) => change(group.kinds.map((entry) => ({ entry, channel: channel.key, on })), `${group.label} ${channel.label.toLowerCase()}: ${on ? 'on' : 'off'}.`)}
                  />
                );
              })}
            </tr>
            {group.kinds.map((entry) => (
              <tr key={entry.kind}>
                <th scope="row">
                  <span className="matrix-label matrix-kind">
                    <Icon name={entry.icon} size={16} />
                    <span className="truncate" title={entry.label}>
                      {entry.label}
                    </span>
                  </span>
                </th>
                {channels.map((channel) =>
                  usable(entry, channel.key) ? (
                    <Cell
                      checked={channelOn(state, entry, channel.key)}
                      disabled={saving.busy}
                      key={channel.key}
                      label={`${entry.label}, ${channel.label.toLowerCase()}`}
                      onChange={(on) => change([{ entry, channel: channel.key, on }], `${entry.label} ${channel.label.toLowerCase()}: ${on ? 'on' : 'off'}.`)}
                    />
                  ) : (
                    <td className="matrix-cell text-faint" key={channel.key} title={channel.key === 'email' ? 'Invitations to your address always come by email' : 'Turn on notifications for this device first'}>
                      —
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        ))}
        <tbody>
          <tr className="matrix-group">
            <th scope="rowgroup">
              <span className="matrix-label">
                <Icon name="shield" size={16} />
                Security
              </span>
            </th>
            <td className="matrix-cell" colSpan={3}>
              <span className="inline-flex items-center gap-1 text-small text-muted">
                <Icon name="lock" size={14} /> Always on
              </span>
            </td>
          </tr>
          {securityKinds.map((label) => (
            <tr key={label}>
              <th scope="row">
                <span className="matrix-label matrix-kind">
                  <Icon name="shield" size={16} />
                  <span className="truncate">{label}</span>
                </span>
              </th>
              <td className="matrix-cell text-faint">—</td>
              <td className="matrix-cell text-faint">—</td>
              <Cell checked label={`${label}, email, always on to keep your account safe`} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 text-small text-muted">Security emails can’t be turned off, so you always hear about changes to your account.</p>
    </div>
  );
}

function Devices({ current }: { current?: string[] | null }) {
  const auth = useAuth();
  const devices = useResource<PushDevice[]>('/me/push-subscriptions', true);
  const action = useAction();
  if (devices.error) return <LoadError compact error={devices.error} onRetry={devices.reload} />;
  if (!devices.data) return <RowsSkeleton rows={1} />;
  if (devices.data.length === 0) return <p className="m-0 text-small text-muted">No device gets notifications yet.{current === null ? ' Turn them on for this device above.' : ''}</p>;
  return (
    <ul className="panel-rows">
      {devices.data.map((device) => (
        <ListRow
          key={device.id}
          lead={<Icon name="monitor" size={18} />}
          meta={`${device.kinds.length} kinds · last used ${formatMoment(device.lastUsedAt)}`}
          title={device.browser}
          trail={
            <IconButton
              disabled={action.busy}
              icon="x"
              label={`Stop notifications on ${device.browser}`}
              onClick={() =>
                void action.run(async () => {
                  await auth.request(`/me/push-subscriptions/${device.id}`, { method: 'DELETE' });
                  devices.mutate((shown) => shown.filter((other) => other.id !== device.id));
                  return `${device.browser} no longer gets notifications.`;
                }, 'Could not stop the notifications')
              }
            />
          }
        />
      ))}
    </ul>
  );
}

export function NotificationSettings() {
  const me = useResource<Me>('/me', true);
  const push = useDevicePush();

  return (
    <>
      <Section description="Choose what reaches you in Strata, on this device and by email. Groups and columns can be switched all at once." title="Notifications">
        {me.error ? (
          <LoadError error={me.error} onRetry={me.reload} />
        ) : !me.data || push.checking ? (
          <Placeholder label="Loading your notifications">
            <RowsSkeleton rows={8} />
          </Placeholder>
        ) : (
          <Matrix mine={me} push={push} />
        )}
      </Section>
      <div className="settings-columns">
        <Section description="Shows notifications even when Strata is closed." title="This device">
          <DevicePush push={push} />
        </Section>
        <Section description="Every device that shows your notifications. Stop one you no longer use." title="Devices that get notifications">
          <Devices current={push.kinds} />
        </Section>
      </div>
    </>
  );
}
