import { useState } from 'react';
import { Checkbox, ConfirmDialog, Dialog, ListRow, SectionHeading, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { categoryName, expenseCategories, useCategories, type MerchantRule, type MoneyAccount, type SenderRule } from '../spending';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ActionsMenu } from './ActionsMenu';
import { FormDialog } from './FormDialog';
import { Hint } from './Hint';
import { LoadError } from './LoadError';

type Editing = { merchant: MerchantRule } | { sender: SenderRule } | { deleteMerchant: MerchantRule } | { deleteSender: SenderRule };

export function RulesEditor({ accounts, onClose, spaceId }: { accounts: MoneyAccount[]; onClose: () => void; spaceId: string }) {
  const auth = useAuth();
  const saving = useAction();
  const merchants = useResource<MerchantRule[]>(`/spaces/${spaceId}/merchant-rules`, true);
  const senders = useResource<SenderRule[]>(`/spaces/${spaceId}/sender-rules`, true);
  const categories = expenseCategories(useCategories(spaceId).data);
  const [editing, setEditing] = useState<Editing>();
  const [chosen, setChosen] = useState<{ category: string; accountId: string; toAccountId: string }>({ category: '', accountId: '', toAccountId: '' });
  const accountName = (id: string | null) => accounts.find((account) => account.id === id)?.name ?? 'Removed account';
  const accountOptions = accounts.map((account) => ({ value: account.id, label: account.name }));
  const senderMeta = (rule: SenderRule) =>
    rule.ignore
      ? 'Ignore every message'
      : rule.toAccountId
        ? `Transfers from ${accountName(rule.accountId)} to ${accountName(rule.toAccountId)}`
        : [accountName(rule.accountId), rule.cardDigits && `•••• ${rule.cardDigits}`].filter(Boolean).join(' · ');
  const edit = (next: Editing) => {
    setChosen({
      category: 'merchant' in next ? (next.merchant.category ?? '') : '',
      accountId: 'sender' in next ? (next.sender.accountId ?? '') : '',
      toAccountId: 'sender' in next ? (next.sender.toAccountId ?? '') : '',
    });
    setEditing(next);
  };

  if (editing && 'merchant' in editing) {
    const rule = editing.merchant;
    return (
      <FormDialog
        busy={saving.busy}
        busyLabel="Saving…"
        onClose={() => setEditing(undefined)}
        onSubmit={(target) => {
          const values = new FormData(target);
          const body = { rename: String(values.get('rename') ?? '').trim() || null, category: chosen.category || null, ignore: values.has('ignore') };
          void saving
            .run(async () => {
              const saved = await auth.request<MerchantRule>(`/merchant-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify(body) });
              merchants.mutate((current) => current.map((shown) => (shown.id === rule.id ? saved : shown)));
              return `Saved the rule for ${rule.match}.`;
            }, 'Could not save the rule')
            .then((done) => done && setEditing(undefined));
        }}
        submitLabel="Save"
        title={`Messages naming ${rule.match}`}
      >
        <TextField autoFocus defaultValue={rule.rename ?? ''} hint="Leave empty to keep the name from the message." label="Call it" maxLength={200} name="rename" />
        <Select
          label="Category"
          onChange={(category: string) => setChosen((current) => ({ ...current, category }))}
          options={[{ value: '', label: 'Not set' }, ...categories.map((category) => ({ value: category.name, label: categoryName(category.name) }))]}
          value={chosen.category}
        />
        <Checkbox defaultChecked={rule.ignore} label="Ignore these messages" name="ignore" />
      </FormDialog>
    );
  }

  if (editing && 'sender' in editing) {
    const rule = editing.sender;
    return (
      <FormDialog
        busy={saving.busy}
        busyLabel="Saving…"
        onClose={() => setEditing(undefined)}
        onSubmit={() => {
          const body = rule.toAccountId ? { accountId: chosen.accountId, toAccountId: chosen.toAccountId } : { accountId: chosen.accountId };
          void saving
            .run(async () => {
              const saved = await auth.request<SenderRule>(`/sender-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify(body) });
              senders.mutate((current) => current.map((shown) => (shown.id === rule.id ? saved : shown)));
              return `Saved the rule for ${rule.sender}.`;
            }, 'Could not save the rule')
            .then((done) => done && setEditing(undefined));
        }}
        submitDisabled={!chosen.accountId || (!!rule.toAccountId && (!chosen.toAccountId || chosen.toAccountId === chosen.accountId))}
        submitLabel="Save"
        title={`Messages from ${rule.sender}`}
      >
        <Select label={rule.toAccountId ? 'Transfers from' : 'Account'} onChange={(accountId: string) => setChosen((current) => ({ ...current, accountId }))} options={accountOptions} value={chosen.accountId} />
        {rule.toAccountId && <Select label="To" onChange={(toAccountId: string) => setChosen((current) => ({ ...current, toAccountId }))} options={accountOptions} value={chosen.toAccountId} />}
      </FormDialog>
    );
  }

  if (editing && 'deleteMerchant' in editing) {
    const rule = editing.deleteMerchant;
    return (
      <ConfirmDialog
        busyLabel="Deleting…"
        confirmLabel="Delete rule"
        errorFallback="Could not delete the rule"
        onClose={() => setEditing(undefined)}
        onConfirm={async () => {
          await auth.request(`/merchant-rules/${rule.id}`, { method: 'DELETE' });
          merchants.mutate((current) => current.filter((shown) => shown.id !== rule.id));
          saving.report(`Deleted the rule for ${rule.match}.`);
          setEditing(undefined);
        }}
        title={`Delete the rule for ${rule.match}?`}
        tone="danger"
      >
        Transactions it has already changed stay as they are.
      </ConfirmDialog>
    );
  }

  if (editing && 'deleteSender' in editing) {
    const rule = editing.deleteSender;
    return (
      <ConfirmDialog
        busyLabel="Deleting…"
        confirmLabel="Delete rule"
        errorFallback="Could not delete the rule"
        onClose={() => setEditing(undefined)}
        onConfirm={async () => {
          await auth.request(`/sender-rules/${rule.id}`, { method: 'DELETE' });
          senders.mutate((current) => current.filter((shown) => shown.id !== rule.id));
          saving.report(`Deleted the rule for ${rule.sender}.`);
          setEditing(undefined);
        }}
        title={`Delete the rule for ${rule.sender}?`}
        tone="danger"
      >
        Transactions it has already placed stay as they are.
      </ConfirmDialog>
    );
  }

  return (
    <Dialog onClose={onClose} title="Rules">
      <div className="mt-5 grid gap-6">
        <Hint>Strata learns these when you review captured messages. Change or delete any of them here.</Hint>
        <section className="grid gap-2">
          <SectionHeading level={3} title="Merchants" />
          {merchants.error ? (
            <LoadError compact error={merchants.error} onRetry={merchants.reload} />
          ) : !merchants.data?.length ? (
            <Hint>{merchants.data ? 'No merchant rules yet.' : 'Loading…'}</Hint>
          ) : (
            <ul className="panel-rows">
              {merchants.data.map((rule) => (
                <ListRow
                  key={rule.id}
                  meta={rule.ignore ? 'Ignore these messages' : [rule.rename, rule.category && categoryName(rule.category)].filter(Boolean).join(' · ') || 'Nothing changed'}
                  title={rule.match}
                  trail={
                    <ActionsMenu
                      items={[
                        { label: 'Edit', onSelect: () => edit({ merchant: rule }) },
                        { label: 'Delete', separated: true, onSelect: () => setEditing({ deleteMerchant: rule }) },
                      ]}
                      name={rule.match}
                    />
                  }
                />
              ))}
            </ul>
          )}
        </section>
        <section className="grid gap-2">
          <SectionHeading level={3} title="Senders" />
          {senders.error ? (
            <LoadError compact error={senders.error} onRetry={senders.reload} />
          ) : !senders.data?.length ? (
            <Hint>{senders.data ? 'No sender rules yet.' : 'Loading…'}</Hint>
          ) : (
            <ul className="panel-rows">
              {senders.data.map((rule) => (
                <ListRow
                  key={rule.id}
                  meta={senderMeta(rule)}
                  title={rule.sender}
                  trail={
                    <ActionsMenu
                      items={[
                        ...(rule.ignore ? [] : [{ label: 'Edit', onSelect: () => edit({ sender: rule }) }]),
                        { label: 'Delete', separated: true, onSelect: () => setEditing({ deleteSender: rule }) },
                      ]}
                      name={rule.sender}
                    />
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
