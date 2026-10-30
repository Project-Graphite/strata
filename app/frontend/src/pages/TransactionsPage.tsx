import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Checkbox, EmptyState, errorMessage, Button as UiButton, FilterChip, Icon, Placeholder, Select, Sheet, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Amount } from '../components/Amount';
import { Button, TextButton } from '../components/Button';
import { CategoryChips } from '../components/CategoryChips';
import { Empty } from '../components/Empty';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { AmountRowsSkeleton, SkeletonLine } from '../components/Skeletons';
import { SpendingFrame } from '../components/SpendingFrame';
import { SelectionBar, toggled } from '../components/Selection';
import { MissingRates } from '../components/Stats';
import {
  accountKindOptions,
  categoryName,
  directionOptions,
  expenseCategories,
  expenseKindOptions,
  mostUsedCategory,
  spendingLive,
  useCategories,
  type Expense,
  type KnownCard,
  type MoneyAccount,
  type TransactionsPage as Page,
} from '../spending';
import { pageScroller } from '../page-scroll';
import { usePageVirtualizer } from '../page-virtualizer';
import { usePersonalSpace } from '../spaces';
import { fromMinor, money, toMinor } from '../subscriptions';
import { useSwipe } from '../swipe';
import { capitalised, formatDate } from '../time';
import { useAction } from '../useAction';
import { useLiveRefresh, useResource } from '../useResource';
import { moneyAmount, useFormErrors } from '../validation';

type Row = Page['expenses'][number];
type Day = Page['days'][number];

interface Listing {
  key: string;
  rows: Row[];
  days: Map<string, Day>;
  next: string | null;
  count: number;
  currency: string;
  missing: string[];
}

type Entry = { kind: 'day'; day: string; first: boolean } | { kind: 'row'; row: Row; first: boolean; last: boolean };

const pageSize = 100;
const filterNames = ['q', 'account', 'card', 'category', 'kind', 'direction', 'min', 'max'] as const;
const emptyTransactions = { title: 'No transactions yet', hint: 'Add an expense, import a statement or connect your phone to see your transactions here.' };

const sortsBefore = (a: Row, b: Row) => (a.spentOn !== b.spentOn ? a.spentOn > b.spentOn : a.createdAt !== b.createdAt ? a.createdAt > b.createdAt : a.id > b.id);
const dayMap = (days: Day[]) => days.map((day) => [day.day, day] as const);

function listingOf(key: string, page: Page): Listing {
  return { key, rows: page.expenses, days: new Map(dayMap(page.days)), next: page.next, count: page.count ?? page.expenses.length, currency: page.currency, missing: page.missing };
}

function refreshed(current: Listing, page: Page): Listing {
  const last = page.expenses.at(-1);
  const kept = page.next && last ? current.rows.filter((row) => sortsBefore(last, row)) : [];
  return {
    ...current,
    rows: [...page.expenses, ...kept],
    days: new Map([...current.days, ...dayMap(page.days)]),
    next: kept.length ? current.next : page.next,
    count: page.count ?? current.count,
    missing: page.missing,
  };
}

export function TransactionsPage() {
  const auth = useAuth();
  const action = useAction();
  const [params, setParams] = useSearchParams();
  const { spaceId, editable } = usePersonalSpace();
  const accounts = useResource<MoneyAccount[]>(spaceId ? `/spaces/${spaceId}/accounts` : null, true, spendingLive);
  const categories = useCategories(spaceId);
  const filters = useMemo(() => {
    const query = new URLSearchParams();
    for (const name of filterNames) {
      const value = params.get(name)?.trim();
      if (value) query.set(name, value);
    }
    return query.toString();
  }, [params]);
  const [listing, setListing] = useState<Listing>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<'filters' | 'category' | 'account' | { expense: Expense }>();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const loadingMore = useRef(false);
  const request = (cursor?: string | null) =>
    auth.request<Page>(`/spaces/${spaceId}/expenses?${new URLSearchParams([...new URLSearchParams(filters), ['limit', String(pageSize)], ...(cursor ? [['cursor', cursor]] : [])])}`);

  useEffect(() => {
    if (!spaceId) return;
    let current = true;
    setSelected(new Set());
    request().then(
      (page) => current && setListing(listingOf(filters, page)),
      (reason: unknown) => current && setFailure({ key: filters, message: errorMessage(reason, 'Could not load the transactions') }),
    );
    return () => {
      current = false;
    };
  }, [spaceId, filters, version]);

  const refresh = () => {
    if (!spaceId || listing?.key !== filters) return;
    const key = filters;
    void request().then(
      (page) => setListing((current) => (current?.key === key ? refreshed(current, page) : current)),
      () => undefined,
    );
  };
  useLiveRefresh(refresh, spendingLive);

  const shown = listing;
  const failed = failure?.key === filters && listing?.key !== filters ? failure.message : '';

  const loadMore = () => {
    if (!shown?.next || shown.key !== filters || loadingMore.current) return;
    loadingMore.current = true;
    const { key, next } = shown;
    request(next).then(
      (page) => {
        loadingMore.current = false;
        setListing((current) =>
          current?.key === key && current.next === next
            ? { ...current, rows: [...current.rows, ...page.expenses], days: new Map([...current.days, ...dayMap(page.days)]), next: page.next, missing: [...new Set([...current.missing, ...page.missing])].sort() }
            : current,
        );
      },
      (reason: unknown) => {
        loadingMore.current = false;
        action.report(errorMessage(reason, 'Could not load more transactions'));
      },
    );
  };
  const accountOf = (id: string | null) => accounts.data?.find((account) => account.id === id);
  const accountName = useCallback((id: string | null) => accounts.data?.find((account) => account.id === id)?.name, [accounts.data]);
  const latest = useRef({ open: (_row: Row) => {}, select: (_id: string) => {}, trash: (_id: string) => {}, more: () => {} });
  useLayoutEffect(() => {
    latest.current = {
      open: (row) => setDialog({ expense: row }),
      select: (id) => setSelected((current) => toggled(current, id)),
      trash: (id) => trash([id]),
      more: loadMore,
    };
  });
  const rowActions = useMemo<RowActions>(() => ({ open: (row) => latest.current.open(row), select: (id) => latest.current.select(id), trash: (id) => latest.current.trash(id) }), []);
  const nearEnd = useCallback(() => latest.current.more(), []);
  const filtered = filterNames.some((name) => params.get(name));
  const account = params.get('account');
  const balanceCurrency = accountOf(account)?.currency ?? shown?.currency ?? 'EGP';
  const chosen = shown?.rows.filter((row) => selected.has(row.id)) ?? [];
  const setFilter = (name: (typeof filterNames)[number], value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, value);
        else next.delete(name);
        next.delete('month');
        return next;
      },
      { replace: name === 'q' },
    );
  useEffect(() => {
    if (search.trim() === (params.get('q') ?? '')) return;
    const timer = window.setTimeout(() => setFilter('q', search.trim() || null), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const patchRows = (ids: string[], change: (row: Row) => Row | null) =>
    setListing((current) =>
      current && {
        ...current,
        rows: current.rows.flatMap((row) => (ids.includes(row.id) ? (change(row) ?? []) : [row])),
        count: current.count - current.rows.filter((row) => ids.includes(row.id) && !change(row)).length,
      },
    );
  const trash = (ids: string[]) =>
    void action.run(async () => {
      await auth.request(`/spaces/${spaceId}/expenses/trash`, { method: 'POST', body: JSON.stringify({ ids }) });
      patchRows(ids, () => null);
      setSelected(new Set());
      return {
        message: ids.length === 1 ? 'Moved the transaction to the trash.' : `Moved ${ids.length} transactions to the trash.`,
        undo: async () => {
          await auth.request(`/spaces/${spaceId}/expenses/restore`, { method: 'POST', body: JSON.stringify({ ids }) });
          setVersion((current) => current + 1);
          return '';
        },
      };
    }, 'Could not move the transactions to the trash');
  const chipLabels: Record<Exclude<(typeof filterNames)[number], 'q'>, (value: string) => string> = {
    account: (value) => accountOf(value)?.name ?? 'Account',
    card: (value) => `•••• ${value}`,
    category: categoryName,
    kind: (value) => expenseKindOptions.find((option) => option.value === value)?.label ?? 'Kind',
    direction: (value) => directionOptions.find((option) => option.value === value)?.label ?? 'Type',
    min: (value) => `At least ${money(Number(value), shown?.currency ?? 'EGP')}`,
    max: (value) => `At most ${money(Number(value), shown?.currency ?? 'EGP')}`,
  };
  const chips = Object.entries(chipLabels).flatMap(([name, label]) => {
    const value = params.get(name);
    return value ? [{ name: name as keyof typeof chipLabels, label: label(value) }] : [];
  });

  return (
    <SpendingFrame
      accounts={accounts.data}
      categories={categories.data}
      currency={shown?.currency}
      onChanged={() => {
        categories.reload();
        refresh();
      }}
      tab="transactions"
      toolbar={
        <div className="grid w-full min-w-0 gap-3">
          <div className="flex min-w-0 items-stretch gap-2">
            <div className="min-w-0 flex-1 sm:max-w-96">
              <TextField autoComplete="off" label="Search transactions" onChange={(event) => setSearch(event.currentTarget.value)} type="search" value={search} />
            </div>
            <Button icon="filter" label={chips.length ? `Filters (${chips.length})` : 'Filters'} large onClick={() => setDialog('filters')} />
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <FilterChip active key={chip.name} label={chip.label} onClick={() => setFilter(chip.name, null)} />
              ))}
              <TextButton
                label="Clear filters"
                onClick={() =>
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    for (const name of filterNames) if (name !== 'q') next.delete(name);
                    return next;
                  })
                }
              />
            </div>
          )}
        </div>
      }
    >
      {failed ? (
        <LoadError error={failed} onRetry={() => setVersion((current) => current + 1)} />
      ) : !shown ? (
        <Placeholder className="grid gap-3" label="Loading transactions">
          <SkeletonLine className="text-small" width="w-32" />
          <AmountRowsSkeleton rows={8} />
        </Placeholder>
      ) : shown.rows.length === 0 ? (
        filtered ? (
          <EmptyState action={<Button label="Clear filters" onClick={() => setParams(new URLSearchParams())} />} title="No transactions match" variant="filtered">
            Try other words or fewer filters.
          </EmptyState>
        ) : (
          <Empty title={emptyTransactions.title}>{emptyTransactions.hint}</Empty>
        )
      ) : (
        <div aria-busy={shown.key !== filters || undefined} className="grid gap-3">
          <MissingRates currencies={shown.missing} />
          <p className="m-0 text-small text-muted tabular-nums">
            {shown.count === 1 ? '1 transaction' : `${shown.count.toLocaleString()} transactions`}
            {account && accountOf(account) && ' · balance after each one'}
          </p>
          <Ledger accountName={accountName} actions={rowActions} balanceCurrency={balanceCurrency} editable={editable} listing={shown} onNearEnd={nearEnd} selected={selected} />
          {shown.next && (
            <p aria-live="polite" className="m-0 py-4 text-center text-small text-muted">
              Loading more…
            </p>
          )}
        </div>
      )}

      {editable && chosen.length > 0 && (
        <SelectionBar label={`${chosen.length} selected`} onClear={() => setSelected(new Set())}>
          <Button icon="tag" label="Category" onClick={() => setDialog('category')} />
          <Button icon="wallet" label="Account" onClick={() => setDialog('account')} />
          <Button icon="trash" label="Delete" onClick={() => trash(chosen.map((row) => row.id))} />
          {chosen.length < shown!.rows.length && <Button label="Select all loaded" onClick={() => setSelected(new Set(shown!.rows.map((row) => row.id)))} />}
        </SelectionBar>
      )}

      {dialog === 'filters' && spaceId && (
        <FiltersSheet
          accounts={accounts.data ?? []}
          categories={expenseCategories(categories.data).map((category) => category.name)}
          currency={shown?.currency ?? 'EGP'}
          onApply={(next) => {
            setParams((current) => {
              const query = new URLSearchParams(current);
              for (const name of filterNames) if (name !== 'q') query.delete(name);
              for (const [name, value] of Object.entries(next)) if (value) query.set(name, value);
              query.delete('month');
              return query;
            });
            setDialog(undefined);
          }}
          onClose={() => setDialog(undefined)}
          params={params}
          spaceId={spaceId}
        />
      )}
      {dialog === 'category' && spaceId && (
        <BulkCategory
          count={chosen.length}
          initial={mostUsedCategory(expenseCategories(categories.data))}
          categories={expenseCategories(categories.data)}
          onClose={() => setDialog(undefined)}
          onSave={async (category) => {
            const ids = chosen.map((row) => row.id);
            await auth.request(`/spaces/${spaceId}/expenses`, { method: 'PATCH', body: JSON.stringify({ ids, category }) });
            patchRows(ids, (row) => (row.direction === 'spent' || row.direction === 'refund' ? { ...row, category } : row));
            setSelected(new Set());
            return `Moved ${ids.length === 1 ? 'the transaction' : `${ids.length} transactions`} to ${categoryName(category).toLowerCase()}.`;
          }}
        />
      )}
      {dialog === 'account' && spaceId && (
        <BulkAccount
          accounts={accounts.data ?? []}
          count={chosen.length}
          onClose={() => setDialog(undefined)}
          onSave={async (accountId) => {
            const ids = chosen.map((row) => row.id);
            await auth.request(`/spaces/${spaceId}/expenses`, { method: 'PATCH', body: JSON.stringify({ ids, accountId }) });
            patchRows(ids, (row) => (row.direction === 'transfer' ? row : { ...row, accountId, cardId: null }));
            setSelected(new Set());
            refresh();
            return `Moved ${ids.length === 1 ? 'the transaction' : `${ids.length} transactions`} to ${accountOf(accountId)?.name ?? 'no account'}.`;
          }}
        />
      )}
      {spaceId && typeof dialog === 'object' && (
        <ExpenseEditor
          accounts={accounts.data ?? []}
          currency={shown?.currency ?? 'EGP'}
          expense={dialog.expense}
          onClose={() => setDialog(undefined)}
          onRestored={() => setVersion((current) => current + 1)}
          onSaved={(saved) => {
            patchRows([saved.id], (row) => ({ ...saved, balanceMinor: row.balanceMinor }));
            refresh();
          }}
          onTrashed={() => patchRows([dialog.expense.id], () => null)}
          spaceId={spaceId}
        />
      )}
    </SpendingFrame>
  );
}

interface RowActions {
  open: (row: Row) => void;
  select: (id: string) => void;
  trash: (id: string) => void;
}

function Ledger({
  accountName,
  actions,
  balanceCurrency,
  editable,
  listing,
  onNearEnd,
  selected,
}: {
  accountName: (id: string | null) => string | undefined;
  actions: RowActions;
  balanceCurrency: string;
  editable: boolean;
  listing: Listing;
  onNearEnd: () => void;
  selected: ReadonlySet<string>;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0);
  const entries = useMemo(() => {
    const found: Entry[] = [];
    const { rows } = listing;
    rows.forEach((row, index) => {
      if (rows[index - 1]?.spentOn !== row.spentOn) found.push({ kind: 'day', day: row.spentOn, first: index === 0 });
      found.push({ kind: 'row', row, first: rows[index - 1]?.spentOn !== row.spentOn, last: rows[index + 1]?.spentOn !== row.spentOn });
    });
    return found;
  }, [listing.rows]);
  useLayoutEffect(() => {
    if (list.current) setMargin(list.current.getBoundingClientRect().top + pageScroller().scrollTop);
  });
  const virtualizer = usePageVirtualizer({
    count: entries.length,
    estimateSize: (index) => {
      const entry = entries[index]!;
      return entry.kind === 'row' ? 64 : entry.first ? 32 : 52;
    },
    overscan: 12,
    scrollMargin: margin,
    getItemKey: (index) => {
      const entry = entries[index]!;
      return entry.kind === 'day' ? `day-${entry.day}` : entry.row.id;
    },
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastShown = virtualItems.at(-1)?.index ?? 0;
  useEffect(() => {
    if (lastShown >= entries.length - 25) onNearEnd();
  }, [lastShown, entries.length, listing.next, onNearEnd]);

  return (
    <ul className="ledger" ref={list} style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map((item) => {
        const entry = entries[item.index]!;
        return (
          <li key={item.key} style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}>
            {entry.kind === 'day' ? (
              <DayHeading currency={listing.currency} day={entry.day} first={entry.first} total={listing.days.get(entry.day)} />
            ) : (
              <TransactionRow
                accountName={accountName}
                actions={actions}
                balanceCurrency={balanceCurrency}
                editable={editable}
                first={entry.first}
                last={entry.last}
                row={entry.row}
                selected={selected.has(entry.row.id)}
                selecting={selected.size > 0}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DayHeading({ currency, day, first, total }: { currency: string; day: string; first: boolean; total?: Day }) {
  return (
    <div className="ledger-day flex items-end justify-between gap-3 pb-2" data-first={first || undefined}>
      <h2 className="m-0 text-h3 text-ink">{capitalised(formatDate(day))}</h2>
      {total && (
        <span className="text-small text-muted tabular-nums">
          {[total.spentMinor !== 0 && `${money(total.spentMinor, currency)} spent`, total.receivedMinor > 0 && `+${money(total.receivedMinor, currency)} in`].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  );
}

const TransactionRow = memo(function TransactionRow({
  accountName,
  actions,
  balanceCurrency,
  editable,
  first,
  last,
  row,
  selected,
  selecting,
}: {
  accountName: (id: string | null) => string | undefined;
  actions: RowActions;
  balanceCurrency: string;
  editable: boolean;
  first: boolean;
  last: boolean;
  row: Row;
  selected: boolean;
  selecting: boolean;
}) {
  const swipe = useSwipe({ enabled: editable, onLeft: () => actions.trash(row.id), onRight: () => actions.select(row.id) });
  const meta = [
    row.direction === 'transfer'
      ? `${accountName(row.accountId) ?? 'Removed account'} → ${accountName(row.toAccountId) ?? 'Removed account'}`
      : row.direction === 'received'
        ? 'Income'
        : `${categoryName(row.category)}${row.direction === 'refund' ? ' refund' : ''}`,
    row.direction !== 'transfer' && [accountName(row.accountId), row.cardDigits && `•••• ${row.cardDigits}`].filter(Boolean).join(' '),
    row.status === 'pending' && 'Pending',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div {...swipe.props} className="list-row swipe-row ledger-row" data-first={first || undefined} data-last={last || undefined} data-selected={selected || undefined}>
      {swipe.offset !== 0 && (
        <span aria-hidden="true" className="swipe-hint" data-side={swipe.offset < 0 ? 'left' : 'right'}>
          <Icon name={swipe.offset < 0 ? 'trash' : 'check'} size={18} />
          {swipe.offset < 0 ? (swipe.passed ? 'Release to delete' : 'Delete') : selected ? 'Deselect' : 'Select'}
        </span>
      )}
      {editable && (
        <span className={`list-row-lead ${selecting ? '' : 'max-md:hidden'}`}>
          <label className="-m-2.5 grid shrink-0 cursor-pointer place-items-center p-2.5">
            <Checkbox aria-label={`Select ${row.title}`} checked={selected} onChange={() => actions.select(row.id)} />
          </label>
        </span>
      )}
      <button className="list-row-main" onClick={() => actions.open(row)} type="button">
        <span className="list-row-text">
          <span className="list-row-title" dir="auto">
            {row.title}
          </span>
          {meta && <span className="list-row-meta truncate">{meta}</span>}
        </span>
      </button>
      <span className="list-row-trail flex-col items-end gap-0">
        <Amount currency={row.currency} direction={row.direction} minor={row.amountMinor} />
        {row.balanceMinor !== null && <span className="text-small text-muted tabular-nums">{money(row.balanceMinor, balanceCurrency)}</span>}
      </span>
    </div>
  );
});

function FiltersSheet({
  accounts,
  categories,
  currency,
  onApply,
  onClose,
  params,
  spaceId,
}: {
  accounts: MoneyAccount[];
  categories: string[];
  currency: string;
  onApply: (filters: Record<string, string>) => void;
  onClose: () => void;
  params: URLSearchParams;
  spaceId: string;
}) {
  const cards = useResource<KnownCard[]>(`/spaces/${spaceId}/cards`, true);
  const form = useFormErrors();
  const [chosen, setChosen] = useState(() => Object.fromEntries(['account', 'card', 'category', 'kind', 'direction'].map((name) => [name, params.get(name) ?? ''])));
  const choose = (name: string) => (value: string) => setChosen((current) => ({ ...current, [name]: value }));
  const amountOf = (name: string) => (params.get(name) ? fromMinor(Number(params.get(name)), currency) : '');
  const formId = 'transaction-filters';
  const accountLabel = (account: MoneyAccount) => `${account.name} · ${accountKindOptions.find((option) => option.value === account.kind)?.label ?? ''}`;

  return (
    <Sheet
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button label="Clear all" large onClick={() => onApply({})} />
          <UiButton form={formId} type="submit" variant="primary">
            Show transactions
          </UiButton>
        </div>
      }
      onClose={onClose}
      title="Filter transactions"
    >
      <form
        className="grid gap-4"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          const optional = (value: string) => (value.trim() ? moneyAmount(value) : undefined);
          if (!form.check(target, { min: [optional], max: [optional] })) return;
          const values = new FormData(target);
          const minor = (name: string) => {
            const text = String(values.get(name) ?? '').trim();
            return text ? String(toMinor(text, currency)) : '';
          };
          onApply({ ...chosen, min: minor('min'), max: minor('max'), q: params.get('q') ?? '' });
        }}
      >
        <Select label="Account" onChange={choose('account')} options={[{ value: '', label: 'All accounts' }, ...accounts.map((account) => ({ value: account.id, label: accountLabel(account) }))]} value={chosen.account!} />
        <Select
          label="Card"
          onChange={choose('card')}
          options={[
            { value: '', label: 'All cards' },
            ...(cards.data ?? []).map((card) => ({ value: card.digits, label: `•••• ${card.digits}`, hint: accounts.find((account) => account.id === card.accountId)?.name })),
            ...(chosen.card && !cards.data?.some((card) => card.digits === chosen.card) ? [{ value: chosen.card, label: `•••• ${chosen.card}` }] : []),
          ]}
          value={chosen.card!}
        />
        <Select label="Category" onChange={choose('category')} options={[{ value: '', label: 'All categories' }, ...categories.map((category) => ({ value: category, label: categoryName(category) }))]} value={chosen.category!} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" onChange={choose('direction')} options={[{ value: '', label: 'Any type' }, ...directionOptions]} value={chosen.direction!} />
          <Select label="Kind" onChange={choose('kind')} options={[{ value: '', label: 'Any kind' }, ...expenseKindOptions]} value={chosen.kind!} />
          <TextField defaultValue={amountOf('min')} inputMode="decimal" label={`At least (${currency})`} {...form.field('min')} />
          <TextField defaultValue={amountOf('max')} inputMode="decimal" label={`At most (${currency})`} {...form.field('max')} />
        </div>
      </form>
    </Sheet>
  );
}

function BulkCategory({
  categories,
  count,
  initial,
  onClose,
  onSave,
}: {
  categories: ReturnType<typeof expenseCategories>;
  count: number;
  initial: string;
  onClose: () => void;
  onSave: (category: string) => Promise<string>;
}) {
  const saving = useAction();
  const [category, setCategory] = useState(initial);
  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={() => void saving.run(() => onSave(category), 'Could not change the category').then((done) => done && onClose())}
      submitLabel="Change category"
      title={count === 1 ? 'Change the category' : `Change the category of ${count} transactions`}
    >
      <p className="m-0 text-small text-muted">Income and transfers keep their category.</p>
      <CategoryChips categories={categories} onChange={setCategory} value={category} />
    </FormDialog>
  );
}

function BulkAccount({ accounts, count, onClose, onSave }: { accounts: MoneyAccount[]; count: number; onClose: () => void; onSave: (accountId: string | null) => Promise<string> }) {
  const saving = useAction();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={() => void saving.run(() => onSave(accountId || null), 'Could not change the account').then((done) => done && onClose())}
      submitLabel="Change account"
      title={count === 1 ? 'Change the account' : `Change the account of ${count} transactions`}
    >
      <p className="m-0 text-small text-muted">Transfers keep their accounts.</p>
      <Select label="Account" onChange={setAccountId} options={[...accounts.map((account) => ({ value: account.id, label: account.name })), { value: '', label: 'No account' }]} value={accountId} />
    </FormDialog>
  );
}
