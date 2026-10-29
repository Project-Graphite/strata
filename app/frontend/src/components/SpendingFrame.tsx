import { useState, type ReactNode } from 'react';
import { Banner, Icon } from '@project-graphite/ui';
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
import { AddTransaction } from './AddTransaction';
import { Button } from './Button';
import { CategoriesEditor } from './CategoriesEditor';
import { ExpenseImport } from './ExpenseImport';
import { Page } from './Page';
import { PhoneSetup } from './PhoneSetup';
import { RulesEditor } from './RulesEditor';

export function SpendingFrame({
  accounts,
  categories,
  children,
  currency = 'EGP',
  onChanged,
  tab,
  toolbar,
}: {
  accounts?: MoneyAccount[];
  categories?: SpendingCategory[];
  children: ReactNode;
  currency?: string;
  onChanged?: () => void;
  tab: SpendingTab;
  toolbar?: ReactNode;
}) {
  const auth = useAuth();
  const action = useAction();
  const [params] = useSearchParams();
  const { spaceId, space, editable } = usePersonalSpace();
  const [dialog, setDialog] = useState<'new' | 'import' | 'phone' | 'categories' | 'rules'>();
  const loadedAccounts = useResource<MoneyAccount[]>((dialog === 'new' || dialog === 'phone' || dialog === 'rules') && !accounts && spaceId ? `/spaces/${spaceId}/accounts` : null, true);
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
                      { label: 'Import expenses from a statement', onSelect: () => setDialog('import') },
                      { label: 'Connect your phone', onSelect: () => setDialog('phone') },
                      { label: 'Edit categories', onSelect: () => setDialog('categories') },
                      { label: 'Edit rules', onSelect: () => setDialog('rules') },
                    ]
                  : []),
                {
                  label: 'Export CSV',
                  onSelect: () =>
                    void action.run(async () => {
                      saveBlob(await auth.request<Blob>(`/spaces/${spaceId}/expenses/export`, {}, readBlob), 'transactions.csv');
                      return '';
                    }, 'Could not export the transactions'),
                },
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
      {children}
      {editable && (
        <button aria-label="New transaction" className="fab" onClick={() => setDialog('new')} type="button">
          <Icon name="plus" size={20} />
        </button>
      )}
      {spaceId && dialog === 'new' && (
        <AddTransaction accounts={accounts ?? loadedAccounts.data ?? []} currency={currency} onClose={() => setDialog(undefined)} onSaved={() => onChanged?.()} spaceId={spaceId} />
      )}
      {spaceId && dialog === 'import' && <ExpenseImport currency={currency} onAdded={() => onChanged?.()} onClose={() => setDialog(undefined)} spaceId={spaceId} />}
      {spaceId && space && dialog === 'phone' && (
        <PhoneSetup accounts={accounts ?? loadedAccounts.data ?? []} onChanged={onChanged} onClose={() => { setDialog(undefined); nativeCapture.refresh(); }} spaceId={spaceId} spaceName={space.name} />
      )}
      {spaceId && editedCategories && dialog === 'categories' && (
        <CategoriesEditor categories={editedCategories} onClose={() => setDialog(undefined)} onSaved={() => onChanged?.()} spaceId={spaceId} />
      )}
      {spaceId && dialog === 'rules' && <RulesEditor accounts={accounts ?? loadedAccounts.data ?? []} onClose={() => setDialog(undefined)} spaceId={spaceId} />}
    </Page>
  );
}
