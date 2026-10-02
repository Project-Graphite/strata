import { ListSkeleton, timeAgo } from '@project-graphite/ui';
import type { Page } from '../../api';
import { useResource } from '../../useResource';
import { SettingsSection } from './SettingsLayout';

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
  access_token_revoked: 'Access token revoked',
};

const reasons: Record<string, string> = { password: 'wrong password', code: 'wrong code' };

export function SecurityLog() {
  const log = useResource<Page<AuditEvent>>('/me/audit?page=1', true);

  return (
    <SettingsSection
      description="Sign-ins and changes to your account security from the last 90 days. If something here was not you, change your password."
      title="Security log"
    >
      {log.error ? (
        <p className="error-message">{log.error}</p>
      ) : !log.data ? (
        <ListSkeleton label="Loading your security log" rows={4} />
      ) : (
        <ul className="mt-5 grid list-none gap-0 p-0">
          {log.data.results.map((event) => (
            <li className="flex items-baseline justify-between gap-4 border-b border-line-soft py-3" key={event.id}>
              <span className={`min-w-0 text-ink ${event.action === 'sign_in_failed' ? 'font-medium' : ''}`}>
                {actions[event.action] ?? event.action}
                {(event.data.device || event.data.reason || event.data.name) && (
                  <span className="mono-sm text-faint">
                    {' · '}
                    {[event.data.reason && reasons[event.data.reason], event.data.device, event.data.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
              <span className="mono-sm shrink-0 text-faint">{timeAgo(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
