import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ConfirmDialog, ListRow, Pagination, Placeholder } from '@project-graphite/ui';
import type { Page as ResultPage } from '../../api';
import { useAuth } from '../../auth';
import { announcePagesChanged } from '../../notes';
import { useAllSpaces, type Item } from '../../spaces';
import type { Expense } from '../../spending';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { ItemList, ItemRowsSkeleton, itemsShape } from '../spaces/ItemList';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Amount } from '../../components/Amount';
import { Empty } from '../../components/Empty';
import { LoadError } from '../../components/LoadError';
import { Section } from '../../components/Page';
import { Button } from '../../components/Button';
import { useRememberedShape } from '../../components/Skeletons';

const empty = { title: 'The trash is empty', hint: 'Anything you move to the trash waits here until you restore it.' };
const dayMs = 24 * 60 * 60 * 1000;
const keptDays = 30;
const periods = ['Today', 'Yesterday', 'Earlier this week', 'Earlier'] as const;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function periodOf(trashedAt: string) {
  const ago = Math.round((startOfDay(new Date()) - startOfDay(new Date(trashedAt))) / dayMs);
  return ago <= 0 ? periods[0] : ago === 1 ? periods[1] : ago < 7 ? periods[2] : periods[3];
}

function timeLeft(trashedAt: string) {
  const left = Math.ceil((new Date(trashedAt).getTime() + keptDays * dayMs - Date.now()) / dayMs);
  return left <= 1 ? 'deleted for good within a day' : `deleted for good in ${left} days`;
}

function byPeriod<T extends { trashedAt: string | null }>(rows: T[]) {
  const newest = [...rows].sort((a, b) => b.trashedAt!.localeCompare(a.trashedAt!));
  return periods.map((period) => ({ period, rows: newest.filter((row) => periodOf(row.trashedAt!) === period) })).filter((group) => group.rows.length > 0);
}

function Periods<T extends { trashedAt: string | null }>({ children, rows }: { children: (rows: T[]) => ReactNode; rows: T[] }) {
  return (
    <div className="grid gap-6">
      {byPeriod(rows).map((group) => (
        <div className="grid gap-2" key={group.period}>
          <h3 className="m-0 text-small font-medium text-muted">{group.period}</h3>
          {children(group.rows)}
        </div>
      ))}
    </div>
  );
}

export function TrashSettings() {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const trash = useResource<ResultPage<Item>>(`/trash?page=${page}`, true);
  const expenses = useResource<Expense[]>('/me/expenses/trash', true, { live: ['spending'] });
  const action = useAction();
  const [deleting, setDeleting] = useState<Item>();
  const [deletingExpense, setDeletingExpense] = useState<Expense>();
  const spaceName = (item: Item) => (item.spaceId ? (spaces.data?.find((space) => space.id === item.spaceId)?.name ?? 'a space') : null);
  const shape = useRememberedShape('settings-trash', trash.data && itemsShape(trash.data.results), [4, 0, 0]);

  return (
    <>
      <Section description={`Newest first. Everything here is deleted for good ${keptDays} days after it was trashed.`} title="Trash">
        {trash.error ? (
          <LoadError error={trash.error} onRetry={trash.reload} />
        ) : !trash.data ? (
          <Placeholder label="Loading the trash">
            {shape[0] ? (
              <ItemRowsSkeleton shape={shape} />
            ) : (
              <Empty loading title={empty.title}>
                {empty.hint}
              </Empty>
            )}
          </Placeholder>
        ) : trash.data.results.length === 0 ? (
          <Empty title={empty.title}>{empty.hint}</Empty>
        ) : (
          <>
            <Periods rows={trash.data.results}>
              {(items) => (
                <ItemList
                  actions={(item) => (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        disabled={action.busy}
                        label="Restore"
                        onClick={() =>
                          void action.run(async () => {
                            await auth.request(`/items/${item.id}/restore`, { method: 'POST' });
                            trash.reload();
                            if (item.kind === 'note' || item.kind === 'board') announcePagesChanged();
                            return `${item.title || 'Untitled'} is back${spaceName(item) ? ` in ${spaceName(item)}` : ''}.`;
                          }, 'Could not restore that')
                        }
                      />
                      <ActionsMenu items={[{ label: 'Delete for good', onSelect: () => setDeleting(item) }]} name={item.title || 'Untitled'} />
                    </div>
                  )}
                  detail={(item) => `${spaceName(item) ?? 'Yours'} · ${timeLeft(item.trashedAt!)}`}
                  items={items}
                />
              )}
            </Periods>
            <Pagination page={trash.data.page} pageHref={(next) => `/settings/trash?page=${next}`} totalPages={trash.data.totalPages} />
          </>
        )}

        {deleting && (
          <ConfirmDialog
            busyLabel="Deleting…"
            confirmLabel="Delete for good"
            errorFallback="Could not delete that"
            onClose={() => setDeleting(undefined)}
            onConfirm={async () => {
              await auth.request(`/items/${deleting.id}`, { method: 'DELETE' });
              trash.reload();
              action.report(`Deleted ${deleting.title || 'Untitled'}.`);
            }}
            title={`Delete ${deleting.title || 'Untitled'} for good?`}
            tone="danger"
          >
            It’s removed{spaceName(deleting) ? ` for everyone in ${spaceName(deleting)}` : ''}, and this can’t be undone.
          </ConfirmDialog>
        )}
      </Section>

      {expenses.data && expenses.data.length > 0 && (
        <Section description={`Newest first. Trashed transactions are deleted for good ${keptDays} days after they were trashed.`} title="Transactions">
          <Periods rows={expenses.data}>
            {(rows) => (
              <ul className="panel-rows">
                {rows.map((expense) => (
                  <ListRow
                    key={expense.id}
                    meta={`transaction · Spending · ${timeLeft(expense.trashedAt!)}`}
                    title={expense.title}
                    trail={
                      <div className="flex shrink-0 items-center gap-2">
                        <Amount currency={expense.currency} direction={expense.direction} minor={expense.amountMinor} />
                        <Button
                          disabled={action.busy}
                          label="Restore"
                          onClick={() =>
                            void action.run(async () => {
                              await auth.request('/me/expenses/restore', { method: 'POST', body: JSON.stringify({ ids: [expense.id] }) });
                              expenses.reload();
                              return `${expense.title} is back in Spending.`;
                            }, 'Could not restore that')
                          }
                        />
                        <ActionsMenu items={[{ label: 'Delete for good', onSelect: () => setDeletingExpense(expense) }]} name={expense.title} />
                      </div>
                    }
                  />
                ))}
              </ul>
            )}
          </Periods>
          {deletingExpense && (
            <ConfirmDialog
              busyLabel="Deleting…"
              confirmLabel="Delete for good"
              errorFallback="Could not delete that"
              onClose={() => setDeletingExpense(undefined)}
              onConfirm={async () => {
                await auth.request('/me/expenses/delete', { method: 'POST', body: JSON.stringify({ ids: [deletingExpense.id] }) });
                expenses.reload();
                action.report(`Deleted ${deletingExpense.title}.`);
              }}
              title={`Delete ${deletingExpense.title} for good?`}
              tone="danger"
            >
              This can’t be undone.
            </ConfirmDialog>
          )}
        </Section>
      )}
    </>
  );
}
