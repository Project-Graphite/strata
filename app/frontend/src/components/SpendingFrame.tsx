import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { saveBlob } from '../files';
import { spendingTabs, useByCategory, useCategories, type MoneyAccount, type SpendingCategory, type SpendingTab } from '../spending';
import { usePersonalSpace } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ActionsMenu } from './ActionsMenu';
import { Button } from './Button';
import { CategoriesEditor } from './CategoriesEditor';
import { ExpenseEditor } from './ExpenseEditor';
import { ExpenseImport } from './ExpenseImport';
import { Page } from './Page';
import { PhoneSetup } from './PhoneSetup';
import { RulesEditor } from './RulesEditor';

export function SpendingFrame({
  accounts,
  categories,
  children,
  currency = 'EUR',
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
  const [byCategory, showByCategory] = useByCategory();
  const [dialog, setDialog] = useState<'new' | 'import' | 'phone' | 'categories' | 'rules'>();
  const loadedAccounts = useResource<MoneyAccount[]>((dialog === 'new' || dialog === 'phone' || dialog === 'rules') && !accounts && spaceId ? `/spaces/${spaceId}/accounts` : null, true);
  const loadedCategories = useCategories(dialog === 'categories' && !categories ? spaceId : null);
  const editedCategories = categories ?? loadedCategories.data;

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
                { label: byCategory ? 'Hide spending by category' : 'Show spending by category', onSelect: () => showByCategory(!byCategory) },
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
            {editable && <Button icon="plus" label="New expense" large onClick={() => setDialog('new')} primary />}
          </>
        )
      }
      tabs={spendingTabs(tab, params)}
      title="Spending"
      toolbar={toolbar}
    >
      {children}
      {spaceId && dialog === 'new' && (
        <ExpenseEditor accounts={accounts ?? loadedAccounts.data ?? []} currency={currency} onClose={() => setDialog(undefined)} onSaved={() => onChanged?.()} spaceId={spaceId} />
      )}
      {spaceId && dialog === 'import' && <ExpenseImport currency={currency} onAdded={() => onChanged?.()} onClose={() => setDialog(undefined)} spaceId={spaceId} />}
      {spaceId && space && dialog === 'phone' && (
        <PhoneSetup accounts={accounts ?? loadedAccounts.data ?? []} onChanged={onChanged} onClose={() => setDialog(undefined)} spaceId={spaceId} spaceName={space.name} />
      )}
      {spaceId && editedCategories && dialog === 'categories' && (
        <CategoriesEditor categories={editedCategories} onClose={() => setDialog(undefined)} onSaved={() => onChanged?.()} spaceId={spaceId} />
      )}
      {spaceId && dialog === 'rules' && <RulesEditor accounts={accounts ?? loadedAccounts.data ?? []} onClose={() => setDialog(undefined)} spaceId={spaceId} />}
    </Page>
  );
}
