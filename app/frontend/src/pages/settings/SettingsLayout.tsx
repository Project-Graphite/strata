import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Tabs } from '@project-graphite/ui';

export interface Me {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  timeZone: string;
  role: string;
}

export interface TwoStepStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

const tabs = [
  ['/settings', 'Profile'],
  ['/settings/security', 'Security'],
  ['/settings/sessions', 'Sessions'],
  ['/settings/tokens', 'Access tokens'],
  ['/settings/data', 'Your data'],
] as const;

export function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="m-0 text-xl font-medium">{title}</h2>
      <p className="mt-2 mb-0 text-sm text-muted">{description}</p>
      {children}
    </section>
  );
}

export function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <div className="page-enter">
      <p className="eyebrow">settings</p>
      <h1 className="page-title">Settings</h1>
      <div className="mt-8">
        <Tabs
          items={tabs.map(([href, label]) => ({ active: pathname === href, href, label }))}
          label="Settings"
        />
      </div>
      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  );
}
