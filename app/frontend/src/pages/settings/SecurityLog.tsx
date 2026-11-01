import { ListRow, Placeholder } from '@project-graphite/ui';
import type { Page } from '../../api';
import { capitalised, formatMoment } from '../../time';
import { useResource } from '../../useResource';
import { Section } from '../../components/Page';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { RowsSkeleton, useRememberedShape } from '../../components/Skeletons';

interface AuditEvent {
  id: string;
  action: string;
  data: { device?: string; reason?: string; name?: string };
  createdAt: string;
}

const actions: Record<string, string> = {
  signed_in: 'Signed in',
  sign_in_failed: 'Failed sign-in',
  password_changed: 'Password changed',
  password_reset: 'Password reset by email',
  email_change_requested: 'Email change requested',
  email_changed: 'Email address changed',
  two_step_enabled: 'Two-step sign-in turned on',
  two_step_disabled: 'Two-step sign-in turned off',
  recovery_codes_regenerated: 'New recovery codes made',
  session_signed_out: 'A device was signed out',
  other_sessions_signed_out: 'Every other device was signed out',
  access_token_created: 'Access token created',
  access_token_updated: 'Access token permissions changed',
  access_token_revoked: 'Access token revoked',
  capture_device_connected: 'Phone connected for spending capture',
  capture_device_revoked: 'Earlier phone connection revoked',
  calendar_feed_reset: 'Calendar link created or reset',
  calendar_feed_disabled: 'Calendar link turned off',
  refresh_token_reused: 'An old sign-in was reused, so every device was signed out',
  share_link_created: 'Share link created',
  share_link_revoked: 'Share link turned off',
  page_grant_saved: 'Page shared with someone',
  page_grant_removed: 'Page access removed',
  webhook_created: 'Webhook created',
  webhook_updated: 'Webhook changed',
  webhook_deleted: 'Webhook deleted',
  member_role_changed: 'Space member role changed',
  admin_granted: 'Made an administrator',
  admin_revoked: 'No longer an administrator',
  system_manager_granted: 'Made the system manager',
  system_manager_revoked: 'No longer the system manager',
  site_settings_changed: 'Site settings changed',
};

const reasons: Record<string, string> = { password: 'wrong password', code: 'wrong code' };
const empty = { title: 'No security events yet', hint: 'Sign-ins, password changes and other account changes show up here.' };

export function SecurityLog() {
  const log = useResource<Page<AuditEvent>>('/me/audit?page=1', true);
  const [rows] = useRememberedShape('settings-security-log', log.data && [log.data.results.length], [4]);

  return (
    <Section title="Security log">
      {log.error ? (
        <LoadError compact error={log.error} onRetry={log.reload} />
      ) : !log.data ? (
        <Placeholder label="Loading your security log">
          {rows ? (
            <RowsSkeleton rows={rows} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : log.data.results.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <ul className="panel-rows">
          {log.data.results.map((event) => (
            <ListRow
              key={event.id}
              meta={capitalised(
                [event.data.reason && reasons[event.data.reason], event.data.device, event.data.name, formatMoment(event.createdAt)].filter(Boolean).join(' · '),
              )}
              title={actions[event.action] ?? event.action}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
