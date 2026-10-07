import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { PageHeader, Tabs } from '@project-graphite/ui';

export interface Me {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  timeZone: string;
  tidySummary: boolean;
  weeklyReview: boolean;
  homeCurrency: string | null;
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
  ['/settings/api', 'API and webhooks'],
  ['/settings/data', 'Your data'],
] as const;

export function SettingsSection({ action, children, title }: { action?: ReactNode; children: ReactNode; title: string }) {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-medium">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SettingsRows({ children }: { children: ReactNode }) {
  return <div className="panel-rows">{children}</div>;
}

export function SettingsRow({ action, children, label }: { action?: ReactNode; children?: ReactNode; label: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5">
      <div className="min-w-0">
        <p className="m-0 text-ink">{label}</p>
        {children && <div className="mt-0.5 text-sm text-muted">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <div className="page-enter grid gap-8">
      <PageHeader title="Settings" />
      <Tabs items={tabs.map(([href, label]) => ({ active: pathname === href, href, label }))} label="Settings" />
      <Outlet />
    </div>
  );
}
