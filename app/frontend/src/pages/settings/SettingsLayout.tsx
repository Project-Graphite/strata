import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ListRow } from '@project-graphite/ui';
import { AboutLinks } from '../../components/AboutLinks';
import { Page } from '../../components/Page';
import { SkeletonLine } from '../../components/Skeletons';
import { isNativeAndroid } from '../../native-capture';

export interface Me {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  timeZone: string;
  tidySummary: boolean;
  weeklyReview: boolean;
  homeCurrency: string | null;
  weekStart: number;
  weekendDays: number[];
  monthStartDay: number;
  budgetsEnabled: boolean;
  role: string;
}

export interface TwoStepStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

const tabs = [
  ['/settings', 'Profile'],
  ['/settings/apps', 'Apps'],
  ['/settings/security', 'Security'],
  ['/settings/developer', 'Developer'],
  ['/settings/data', 'Your data'],
  ['/settings/trash', 'Trash'],
  ['/settings/legal', 'Legal'],
] as const;

export function SettingsRows({ children }: { children: ReactNode }) {
  return <ul className="panel-rows">{children}</ul>;
}

export function SettingsRow({ action, children, label }: { action?: ReactNode; children?: ReactNode; label: ReactNode }) {
  return <ListRow meta={children} title={label} trail={action} />;
}

export function SettingsRowSkeleton({ action, detail = true, row = 0 }: { action?: ReactNode; detail?: boolean; row?: number }) {
  return (
    <SettingsRow action={action} label={<SkeletonLine width={row % 2 ? 'w-24' : 'w-32'} />}>
      {detail && <SkeletonLine width={row % 2 ? 'w-56 max-w-full' : 'w-72 max-w-full'} />}
    </SettingsRow>
  );
}

export function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <Page tabs={tabs.map(([href, label]) => ({ active: pathname === href || (href === '/settings/legal' && pathname.startsWith(`${href}/`)), href, label }))} title="Settings">
      <div className="grid max-w-narrow gap-8">
        <Outlet />
      </div>
      {!isNativeAndroid() && <AboutLinks legal={false} />}
    </Page>
  );
}
