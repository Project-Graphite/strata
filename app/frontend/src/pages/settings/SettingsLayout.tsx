import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Tabs } from '@project-graphite/ui';
import { Page } from '../../components/Page';
import type { TimeFormat } from '../../time';

export interface Me {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  timeZone: string;
  timeFormat: TimeFormat;
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
  ['/settings/features', 'Features'],
  ['/settings/security', 'Security'],
  ['/settings/developer', 'Developer'],
  ['/settings/data', 'Your data'],
] as const;

export function SettingsRows({ children }: { children: ReactNode }) {
  return <div className="panel-rows">{children}</div>;
}

export function SettingsRow({ action, children, label }: { action?: ReactNode; children?: ReactNode; label: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 panel-row">
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
    <Page title="Settings">
      <Tabs items={tabs.map(([href, label]) => ({ active: pathname === href, href, label }))} label="Settings" />
      <Outlet />
    </Page>
  );
}
