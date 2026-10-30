import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Banner, DatePicker, Icon } from '@project-graphite/ui';
import { useSearchParams } from 'react-router';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { saveBlob } from '../files';
import { phoneCaptureAttention, useNativeCaptureStatus } from '../native-capture';
import { spendingTabs, useCategories, type MoneyAccount, type SpendingCategory, type SpendingTab } from '../spending';
import { usePersonalSpace } from '../spaces';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ActionsMenu } from './ActionsMenu';
import { Button } from './Button';
import { Empty } from './Empty';
import { FormDialog } from './FormDialog';
import { Hint } from './Hint';
import { Page } from './Page';
import { PhoneSetup } from './PhoneSetup';

const AddTransaction = lazy(() => import('./AddTransaction').then((module) => ({ default: module.AddTransaction })));
const CategoriesEditor = lazy(() => import('./CategoriesEditor').then((module) => ({ default: module.CategoriesEditor })));
const ExpenseImport = lazy(() => import('./ExpenseImport').then((module) => ({ default: module.ExpenseImport })));
const RulesEditor = lazy(() => import('./RulesEditor').then((module) => ({ default: module.RulesEditor })));

export interface SpendingFirstRun {
  title: string;
  hint: string;
}

export function SpendingFirstRunSkeleton({ empty }: { empty: SpendingFirstRun }) {
  const { space, editable } = usePersonalSpace();
  return (
    <Empty action={(!space || editable) && <Button icon="plus" label="New transaction" primary />} icon="wallet" loading title={empty.title} variant="page">
      {empty.hint}
    </Empty>
  );
}

export function SpendingFrame({
  accounts,
  categories,
  children,
  currency = 'EGP',
  empty,
  onChanged,
  tab,
  toolbar,
}: {
  accounts?: MoneyAccount[];
  categories?: SpendingCategory[];
  children: ReactNode;
  currency?: string;
  empty?: SpendingFirstRun;
  onChanged?: () => void;
  tab: SpendingTab;
  toolbar?: ReactNode;
}) {
  const [params] = useSearchParams();
  const { spaceId, space, editable } = usePersonalSpace();
  const [dialog, setDialog] = useState<'new' | 'import' | 'export' | 'phone' | 'categories' | 'rules'>();
  const loadedAccounts = useResource<MoneyAccount[]>((dialog === 'new' || dialog === 'import' || dialog === 'phone' || dialog === 'rules') && !accounts && spaceId ? `/spaces/${spaceId}/accounts` : null, true);
  const loadedCategories = useCategories(dialog === 'categories' && !categories ? spaceId : null);
  const editedCategories = categories ?? loadedCategories.data;
  const me = useResource<{ budgetsEnabled: boolean }>('/me', true);
  const nativeCapture = useNativeCaptureStatus();
  const phone = nativeCapture.status;
  const attention = phone && editable ? phoneCaptureAttention(phone) : null;

  return (
    <Page
      actions={
        spaceId && (
          <>
            <ActionsMenu
              items={[
                ...(editable
                  ? [
                      { label: 'Import a statement', onSelect: () => setDialog('import') },
                      { label: 'Connect your phone', onSelect: () => setDialog('phone') },
                      { label: 'Edit categories', onSelect: () => setDialog('categories') },
                      { label: 'Edit rules', onSelect: () => setDialog('rules') },
                    ]
                  : []),
                { label: 'Export CSV', onSelect: () => setDialog('export') },
              ]}
              name="spending"
            />
            {editable && (
              <span className="page-primary-action">
                <Button icon="plus" label="New transaction" large onClick={() => setDialog('new')} primary />
              </span>
            )}
          </>
        )
      }
      tabs={spendingTabs(tab, params, me.data?.budgetsEnabled !== false)}
      title="Spending"
      toolbar={toolbar}
    >
      {phone && attention && (
        <Banner
          action={<Button label={attention === 'paused' ? 'Choose senders' : attention === 'renew' ? 'Renew' : 'Reconnect'} onClick={() => setDialog('phone')} />}
          title={attention === 'paused' ? 'Phone capture is paused' : attention === 'renew' ? 'Renew your phone connection' : 'Reconnect your phone'}
          tone="warning"
        >
          {attention === 'paused'
            ? 'Choose which SMS senders and finance apps this phone reads. Until then nothing is sent.'
            : attention === 'renew'
              ? `The connection ends ${formatMoment(phone.tokenExpiresAt)}. Renewing keeps bank messages coming in.`
              : `Strata stopped accepting messages from this phone. ${phone.queuedCount} waiting will be sent once you reconnect.`}
        </Banner>
      )}
      {empty && (
        <Empty action={editable && <Button icon="plus" label="New transaction" onClick={() => setDialog('new')} primary />} icon="wallet" title={empty.title} variant="page">
          {empty.hint}
        </Empty>
      )}
      {children}
      {editable && (
        <div className="fab-clearance">
          <button aria-label="New transaction" className="fab" onClick={() => setDialog('new')} type="button">
            <Icon name="plus" size={20} />
          </button>
        </div>
      )}
      <Suspense fallback={null}>
        {spaceId && dialog === 'new' && (
          <AddTransaction accounts={accounts ?? loadedAccounts.data ?? []} currency={currency} onClose={() => setDialog(undefined)} onSaved={() => onChanged?.()} spaceId={spaceId} />
        )}
        {spaceId && dialog === 'import' && <ExpenseImport accounts={accounts ?? loadedAccounts.data ?? []} currency={currency} onAdded={() => onChanged?.()} onClose={() => setDialog(undefined)} spaceId={spaceId} />}
        {spaceId && dialog === 'export' && <ExportDialog onClose={() => setDialog(undefined)} spaceId={spaceId} />}
        {spaceId && space && dialog === 'phone' && (
          <PhoneSetup accounts={accounts ?? loadedAccounts.data ?? []} onChanged={onChanged} onClose={() => { setDialog(undefined); nativeCapture.refresh(); }} spaceId={spaceId} spaceName={space.name} />
        )}
        {spaceId && editedCategories && dialog === 'categories' && (
          <CategoriesEditor categories={editedCategories} onClose={() => setDialog(undefined)} onSaved={() => onChanged?.()} spaceId={spaceId} />
        )}
        {spaceId && dialog === 'rules' && <RulesEditor accounts={accounts ?? loadedAccounts.data ?? []} onClose={() => setDialog(undefined)} spaceId={spaceId} />}
      </Suspense>
    </Page>
  );
}

function ExportDialog({ onClose, spaceId }: { onClose: () => void; spaceId: string }) {
  const auth = useAuth();
  const saving = useAction();
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const range = new URLSearchParams([...(from ? [['from', from]] : []), ...(until ? [['until', until]] : [])]).toString();

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Exporting…"
      onClose={onClose}
      onSubmit={() =>
        void saving
          .run(async () => {
            saveBlob(await auth.request<Blob>(`/spaces/${spaceId}/expenses/export${range ? `?${range}` : ''}`, {}, readBlob), `transactions${from ? `-${from}` : ''}${until ? `-to-${until}` : ''}.csv`);
            return '';
          }, 'Could not export the transactions')
          .then((done) => done && onClose())
      }
      submitDisabled={Boolean(from && until && from > until)}
      submitLabel="Export CSV"
      title="Export transactions"
    >
      <Hint>Leave a date empty to export from the first or up to the last transaction.</Hint>
      <div className="grid gap-4 sm:grid-cols-2">
        <DatePicker label="From" max={until || undefined} onChange={setFrom} value={from} />
        <DatePicker label="Until" min={from || undefined} onChange={setUntil} value={until} />
      </div>
    </FormDialog>
  );
}
