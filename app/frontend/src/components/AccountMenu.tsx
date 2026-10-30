import { Menu } from '@project-graphite/ui';
import { isAdmin, useAuth } from '../auth';

export function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const auth = useAuth();
  if (!auth.user) return null;
  const { displayName, handle } = auth.user;

  return (
    <Menu
      header={
        <div className="border-b border-line px-4 py-3">
          <p className="m-0 truncate text-body text-ink">{displayName}</p>
          <p className="m-0 truncate text-small text-muted">@{handle}</p>
        </div>
      }
      items={[
        { label: 'Settings', href: '/settings' },
        ...(isAdmin(auth.user) ? [{ label: 'Admin', href: '/admin' }] : []),
        { label: 'Sign out', onSelect: onSignOut, separated: true },
      ]}
      label="Account"
      trigger={displayName.charAt(0).toUpperCase()}
      triggerLabel={`Account menu for ${displayName}`}
    />
  );
}
