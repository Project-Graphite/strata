import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatDay, Icon, Menu, Meter, PageSkeleton, TextField } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { EventEditor } from '../components/EventEditor';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section } from '../components/Page';
import { TripEditor } from '../components/TripEditor';
import { fileSize, maxUploadBytes, saveBlob, uploadFile } from '../files';
import { categoryName, type MoneyAccount } from '../spending';
import { useSpaces } from '../spaces';
import { money } from '../subscriptions';
import { TaskRow, type Task } from '../tasks';
import { tripDates, type TripDetail } from '../trips';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { clockTime } from '../time';

export function TripPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const trip = useResource<TripDetail>(`/trips/${id}`, true);
  const action = useAction();
  const [dialog, setDialog] = useState<'edit' | 'plan' | 'pack' | 'expense'>();
  const accounts = useResource<MoneyAccount[]>(trip.data ? `/spaces/${trip.data.spaceId}/accounts` : null, true);

  if (trip.error) return <LoadError error={trip.error} onRetry={trip.reload} />;
  if (!trip.data) return <PageSkeleton label="Loading the trip" />;
  const shown = trip.data;
  const space = spaces.data?.find((candidate) => candidate.id === shown.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');

  function link(targetId: string) {
    return action.run(async () => {
      await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId, kind: 'reference' }) });
      trip.reload();
      return '';
    }, 'Could not add it to the trip');
  }

  const unlinkMenu = (linkId: string, title: string) =>
    editable && (
      <Menu
        items={[
          {
            label: 'Remove from this trip',
            onSelect: () =>
              void action.run(async () => {
                await auth.request(`/items/${shown.id}/links/${linkId}`, { method: 'DELETE' });
                trip.reload();
                return `${title} is no longer part of this trip. It is still in ${shown.spaceName}.`;
              }, 'Could not remove it from the trip'),
          },
        ]}
        label={`${title} actions`}
        trigger={<Icon name="more" size={18} />}
        triggerClassName="icon-button"
        triggerLabel={`Actions for ${title}`}
      />
    );

  const days = [...new Set(shown.itinerary.map((entry) => entry.startsOn))];
  const packed = shown.packing?.tasks.filter((task) => task.completedAt).length ?? 0;
  const budgetCurrency = shown.currency ?? shown.spending.currency;

  return (
    <Page
      actions={
        editable && (
          <>
            <HeaderButton icon="pencil" label="Edit" onClick={() => setDialog('edit')} />
            <Menu
              items={[
                {
                  label: 'Move to trash',
                  onSelect: () =>
                    void action.run(async () => {
                      await auth.request(`/items/${shown.id}/trash`, { method: 'POST' });
                      navigate('/trips');
                      return `Moved ${shown.title} to the trash. Its events, files and expenses stay in ${shown.spaceName}.`;
                    }, 'Could not move the trip to the trash'),
                },
              ]}
              label="Trip actions"
              trigger={<Icon name="more" size={18} />}
              triggerClassName="icon-button"
              triggerLabel="More trip actions"
            />
          </>
        )
      }
      description={[shown.destination, tripDates(shown)].filter(Boolean).join(' · ')}
      eyebrow={shown.spaceName}
      title={shown.title}
    >
      <Section action={editable && <HeaderButton icon="plus" label="Add a plan" onClick={() => setDialog('plan')} />} title="Itinerary">
        {days.length === 0 ? (
          <p className="m-0 text-sm text-muted">No plans yet.</p>
        ) : (
          <div className="grid gap-4">
            {days.map((day) => (
              <div className="grid gap-2" key={day}>
                <h3 className="m-0 text-sm font-medium text-muted">{formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <ul className="panel-rows">
                  {shown.itinerary
                    .filter((entry) => entry.startsOn === day)
                    .map((entry) => (
                      <li className="panel-row flex items-center gap-3" key={entry.linkId}>
                        <Link className="grid min-w-0 flex-1 text-ink no-underline hover:underline" to={`/events/${entry.id}`}>
                          <span className="truncate">{entry.title}</span>
                          <span className="truncate text-sm text-muted">{[entry.startTime ? `${clockTime(entry.startTime)}${entry.endTime ? `–${clockTime(entry.endTime)}` : ''}` : 'All day', entry.location].filter(Boolean).join(' · ')}</span>
                        </Link>
                        {unlinkMenu(entry.linkId, entry.title)}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {shown.packing && (
        <Section
          action={editable && <HeaderButton icon="plus" label="Add item" onClick={() => setDialog('pack')} />}
          description={shown.packing.tasks.length ? `${packed} of ${shown.packing.tasks.length} packed` : undefined}
          title="Packing list"
        >
          {shown.packing.tasks.length === 0 ? (
            <p className="m-0 text-sm text-muted">Nothing on the list yet.</p>
          ) : (
            <ul className="m-0 grid list-none gap-0 p-0">
              {shown.packing.tasks.map((task) => (
                <TaskRow
                  disabled={!editable || action.busy}
                  key={task.id}
                  onEdit={() => navigate(`/spaces/${shown.spaceId}/tasks?list=${shown.packing!.id}`)}
                  onToggle={() =>
                    void action.run(async () => {
                      await auth.request<Task>(`/tasks/${task.id}/${task.completedAt ? 'reopen' : 'complete'}`, { method: 'POST' });
                      trip.reload();
                      return '';
                    }, 'Could not update the list')
                  }
                  task={task}
                />
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section action={editable && <HeaderButton icon="plus" label="Add expense" onClick={() => setDialog('expense')} />} title="Spending">
        <div className="grid gap-2">
          <p className="m-0 text-ink">
            {money(shown.spending.spentMinor, shown.spending.currency)} spent
            {shown.budgetMinor !== null && <span className="text-muted"> of {money(shown.budgetMinor, budgetCurrency)}</span>}
          </p>
          {shown.budgetMinor !== null && <Meter label="Spent of the trip budget" value={shown.budgetMinor ? shown.spending.spentMinor / shown.budgetMinor : 1} />}
          {shown.spending.missing.length > 0 && <p className="notice m-0">There is no exchange rate for {shown.spending.missing.join(', ')} yet, so those amounts are left out.</p>}
        </div>
        {shown.expenses.length > 0 && (
          <ul className="panel-rows">
            {shown.expenses.map((expense) => (
              <li className="panel-row flex items-center gap-3" key={expense.linkId}>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-ink">{expense.title}</span>
                  <span className="truncate text-sm text-muted">
                    {formatDay(expense.spentOn, { day: 'numeric', month: 'short' })} · {categoryName(expense.category)}
                  </span>
                </span>
                <span className="shrink-0 text-ink">{money(expense.amountMinor, expense.currency)}</span>
                {unlinkMenu(expense.linkId, expense.title)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        action={
          editable && (
            <label className={`secondary-button px-3 py-2 text-sm ${action.busy ? 'pointer-events-none opacity-60' : ''}`}>
              <Icon name="upload" size={16} />
              Upload
              <input
                className="sr-only"
                multiple
                onChange={(event) => {
                  const chosen = [...(event.currentTarget.files ?? [])];
                  event.currentTarget.value = '';
                  void action.run(async () => {
                    const accepted = chosen.filter((file) => file.size <= maxUploadBytes);
                    for (const file of accepted) {
                      const uploaded = await uploadFile(auth.request, shown.spaceId, file);
                      await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: uploaded.id, kind: 'reference' }) });
                    }
                    trip.reload();
                    return accepted.length < chosen.length ? 'Files over 25 MB were left out.' : '';
                  }, 'Could not upload that file');
                }}
                type="file"
              />
            </label>
          )
        }
        title="Documents"
      >
        {shown.documents.length === 0 ? (
          <p className="m-0 text-sm text-muted">No documents yet.</p>
        ) : (
          <ul className="panel-rows">
            {shown.documents.map((document) => (
              <li className="panel-row flex items-center gap-3" key={document.linkId}>
                <Icon name="file" size={18} />
                <button
                  className="grid min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
                  onClick={() =>
                    void action.run(async () => {
                      saveBlob(await auth.request<Blob>(`/files/${document.id}`, {}, readBlob), document.title);
                      return '';
                    }, 'Could not download that file')
                  }
                  type="button"
                >
                  <span className="truncate text-ink">{document.title}</span>
                  {document.sizeBytes !== null && <span className="text-sm text-muted">{fileSize(document.sizeBytes)}</span>}
                </button>
                {unlinkMenu(document.linkId, document.title)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        action={
          editable && (
            <HeaderButton
              icon="plus"
              label="New page"
              onClick={() =>
                void action.run(async () => {
                  const page = await auth.request<{ id: string }>(`/spaces/${shown.spaceId}/notes`, { method: 'POST', body: JSON.stringify({ title: `${shown.title} notes` }) });
                  await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: page.id, kind: 'reference' }) });
                  navigate(`/notes/${page.id}`);
                  return '';
                }, 'Could not start the page')
              }
            />
          )
        }
        title="Notes"
      >
        {shown.pages.length === 0 ? (
          <p className="m-0 text-sm text-muted">No pages yet.</p>
        ) : (
          <ul className="panel-rows">
            {shown.pages.map((page) => (
              <li className="panel-row flex items-center gap-3" key={page.linkId}>
                <Icon name="file" size={18} />
                <Link className="min-w-0 flex-1 truncate text-ink no-underline hover:underline" to={`/notes/${page.id}`}>
                  {page.title || 'Untitled'}
                </Link>
                {unlinkMenu(page.linkId, page.title || 'Untitled')}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {dialog === 'edit' && space && <TripEditor onClose={() => setDialog(undefined)} onSaved={() => trip.reload()} spaces={[space]} trip={shown} />}
      {dialog === 'plan' && <EventEditor onClose={() => setDialog(undefined)} onSaved={(event) => void link(event.id)} spaceId={shown.spaceId} startsOn={shown.startsOn} />}
      {dialog === 'expense' && <ExpenseEditor accounts={accounts.data ?? []} currency={budgetCurrency} onClose={() => setDialog(undefined)} onSaved={(expense) => void link(expense.id)} spaceId={shown.spaceId} />}
      {dialog === 'pack' && shown.packing && (
        <PackDialog
          onClose={() => setDialog(undefined)}
          onSubmit={(title) =>
            action
              .run(async () => {
                await auth.request(`/spaces/${shown.spaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title, listId: shown.packing!.id }) });
                trip.reload();
                return '';
              }, 'Could not add it to the packing list')
              .then((done) => done && setDialog(undefined))
          }
          busy={action.busy}
        />
      )}
    </Page>
  );
}

function PackDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (title: string) => void }) {
  const form = useFormErrors();
  return (
    <FormDialog
      busy={busy}
      busyLabel="Adding…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { title: [required('Say what to pack.'), atMost(200, 'Use at most 200 characters.')] })) return;
        onSubmit(String(new FormData(target).get('title')).trim());
      }}
      submitLabel="Add to list"
      title="Add to the packing list"
    >
      <TextField autoComplete="off" autoFocus label="Item" maxLength={200} placeholder="Passport" {...form.field('title')} />
    </FormDialog>
  );
}
