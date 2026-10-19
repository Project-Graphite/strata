import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatDay, Icon, IconButton, type MenuItem, Meter, TextField } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { EventEditor } from '../components/EventEditor';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { FileButton } from '../components/FileButton';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { DetailState, Page, Section, Subheading } from '../components/Page';
import { RowText } from '../components/RowText';
import { MissingRates } from '../components/Stats';
import { OpenTask } from '../components/TaskEditor';
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
  const [dialog, setDialog] = useState<'edit' | 'event' | 'pack' | 'expense'>();
  const [openTask, setOpenTask] = useState<Task>();
  const accounts = useResource<MoneyAccount[]>(trip.data ? `/spaces/${trip.data.spaceId}/accounts` : null, true);

  const back = { to: '/trips', label: 'Trips' };
  if (!trip.data) return <DetailState back={back} resource={trip} thing="Trip" />;
  const shown = trip.data;
  const space = spaces.data?.find((candidate) => candidate.id === shown.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');

  async function link(targetId: string) {
    await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId, kind: 'reference' }) });
    trip.reload();
  }

  const addToTrip = (targetId: string) =>
    void action.run(async () => {
      await link(targetId);
      return '';
    }, 'Could not add it to the trip');

  const linkedMenu = (linked: { linkId: string; id: string; title: string }, items: MenuItem[] = []) =>
    editable && (
      <ActionsMenu
        items={[
          ...items,
          {
            label: 'Remove from this trip',
            separated: items.length > 0,
            onSelect: () =>
              void action.run(async () => {
                await auth.request(`/items/${shown.id}/links/${linked.linkId}`, { method: 'DELETE' });
                trip.reload();
                return {
                  message: `Removed ${linked.title} from this trip. It’s still in ${shown.spaceName}.`,
                  undo: async () => {
                    await link(linked.id);
                    return '';
                  },
                };
              }, 'Could not remove it from the trip'),
          },
        ]}
        name={linked.title}
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
            <IconButton icon="pencil" label="Edit" onClick={() => setDialog('edit')} />
            <ActionsMenu
              items={[
                {
                  label: 'Move to trash',
                  separated: true,
                  onSelect: () =>
                    void action.run(async () => {
                      await auth.request(`/items/${shown.id}/trash`, { method: 'POST' });
                      navigate('/trips');
                      return {
                        message: `Moved ${shown.title} to the trash. Its events, files and expenses stay in ${shown.spaceName}.`,
                        undo: async () => {
                          await auth.request(`/items/${shown.id}/restore`, { method: 'POST' });
                          navigate(`/trips/${shown.id}`);
                          return '';
                        },
                      };
                    }, 'Could not move the trip to the trash'),
                },
              ]}
              name={shown.title}
            />
          </>
        )
      }
      back={back}
      description={[shown.spaceName, shown.destination, tripDates(shown)].filter(Boolean).join(' · ')}
      title={shown.title}
    >
      <Section action={editable && <Button icon="plus" label="New event" large onClick={() => setDialog('event')} />} title="Itinerary">
        {days.length === 0 ? (
          <Hint>No events yet.</Hint>
        ) : (
          <div className="grid gap-4">
            {days.map((day) => (
              <div className="grid gap-2" key={day}>
                <Subheading>{formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</Subheading>
                <ul className="panel-rows">
                  {shown.itinerary
                    .filter((entry) => entry.startsOn === day)
                    .map((entry) => (
                      <li className="flex items-center pe-2 hover:bg-line-soft" key={entry.linkId}>
                        <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" to={`/events/${entry.id}`}>
                          <RowText
                            detail={[entry.startTime ? `${clockTime(entry.startTime)}${entry.endTime ? `–${clockTime(entry.endTime)}` : ''}` : 'All day', entry.location].filter(Boolean).join(' · ')}
                            title={entry.title}
                          />
                        </Link>
                        {linkedMenu(entry)}
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
          action={editable && <Button icon="plus" label="Add item" large onClick={() => setDialog('pack')} />}
          description={shown.packing.tasks.length ? `${packed} of ${shown.packing.tasks.length} packed` : undefined}
          title="Packing"
        >
          {shown.packing.tasks.length === 0 ? (
            <Hint>Nothing to pack yet.</Hint>
          ) : (
            <ul className="panel-rows">
              {shown.packing.tasks.map((task) => (
                <TaskRow
                  disabled={!editable || action.busy}
                  key={task.id}
                  onEdit={() => setOpenTask(task)}
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

      <Section action={editable && <Button icon="plus" label="New expense" large onClick={() => setDialog('expense')} />} title="Spending">
        <div className="grid gap-2">
          <p className="m-0 text-ink">
            {money(shown.spending.spentMinor, shown.spending.currency)} spent
            {shown.budgetMinor !== null && <span className="text-muted"> of {money(shown.budgetMinor, budgetCurrency)}</span>}
          </p>
          {shown.budgetMinor !== null && <Meter label="Spent of the trip budget" value={shown.budgetMinor ? shown.spending.spentMinor / shown.budgetMinor : 1} />}
          <MissingRates currencies={shown.spending.missing} />
        </div>
        {shown.expenses.length > 0 && (
          <ul className="panel-rows">
            {shown.expenses.map((expense) => (
              <li className="panel-row flex items-center gap-3" key={expense.linkId}>
                <RowText
                  detail={<>{formatDay(expense.spentOn, { day: 'numeric', month: 'short' })} · {categoryName(expense.category)}</>}
                  title={expense.title}
                />
                <Amount currency={expense.currency} minor={expense.amountMinor} />
                {linkedMenu(expense)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        action={
          editable && (
            <FileButton
              busy={action.busy}
              label="Upload"
              multiple
              onFiles={(chosen) =>
                void action.run(async () => {
                  const accepted = chosen.filter((file) => file.size <= maxUploadBytes);
                  for (const file of accepted) {
                    const uploaded = await uploadFile(auth.request, shown.spaceId, file);
                    await auth.request(`/items/${shown.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: uploaded.id, kind: 'reference' }) });
                  }
                  trip.reload();
                  return [
                    accepted.length > 0 && `Added ${accepted.length === 1 ? accepted[0]!.name : `${accepted.length} files`}.`,
                    accepted.length < chosen.length && 'Files over 25 MB were left out.',
                  ]
                    .filter(Boolean)
                    .join(' ');
                }, 'Could not upload that file')
              }
            />
          )
        }
        title="Documents"
      >
        {shown.documents.length === 0 ? (
          <Hint>No documents yet.</Hint>
        ) : (
          <ul className="panel-rows">
            {shown.documents.map((document) => (
              <li className="panel-row flex items-center gap-3" key={document.linkId}>
                <Icon name="file" size={18} />
                <RowText detail={document.sizeBytes !== null && fileSize(document.sizeBytes)} title={document.title} />
                {linkedMenu(document, [
                  {
                    label: 'Download',
                    onSelect: () =>
                      void action.run(async () => {
                        saveBlob(await auth.request<Blob>(`/files/${document.id}`, {}, readBlob), document.title);
                        return '';
                      }, 'Could not download that file'),
                  },
                ])}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        action={
          editable && (
            <Button
              icon="plus"
              label="New page"
              large
              onClick={() =>
                void action.run(async () => {
                  const page = await auth.request<{ id: string }>(`/spaces/${shown.spaceId}/notes`, { method: 'POST', body: JSON.stringify({ title: `${shown.title} notes` }) });
                  await link(page.id);
                  navigate(`/notes/${page.id}`);
                  return '';
                }, 'Could not start the page')
              }
            />
          )
        }
        title="Pages"
      >
        {shown.pages.length === 0 ? (
          <Hint>No pages yet.</Hint>
        ) : (
          <ul className="panel-rows">
            {shown.pages.map((page) => (
              <li className="flex items-center pe-2 hover:bg-line-soft" key={page.linkId}>
                <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" to={`/notes/${page.id}`}>
                  <Icon name="file" size={18} />
                  <RowText title={page.title || 'Untitled'} />
                </Link>
                {linkedMenu({ ...page, title: page.title || 'Untitled' })}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {dialog === 'edit' && space && <TripEditor onClose={() => setDialog(undefined)} onSaved={() => trip.reload()} spaces={[space]} trip={shown} />}
      {dialog === 'event' && <EventEditor onClose={() => setDialog(undefined)} onSaved={(event) => addToTrip(event.id)} spaceId={shown.spaceId} startsOn={shown.startsOn} />}
      {dialog === 'expense' && <ExpenseEditor accounts={accounts.data ?? []} currency={budgetCurrency} onClose={() => setDialog(undefined)} onSaved={(expense) => addToTrip(expense.id)} spaceId={shown.spaceId} />}
      {dialog === 'pack' && shown.packing && (
        <PackDialog
          busy={action.busy}
          onClose={() => setDialog(undefined)}
          onSubmit={(title) =>
            action
              .run(async () => {
                await auth.request(`/spaces/${shown.spaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title, listId: shown.packing!.id }) });
                trip.reload();
                return `Added ${title} to the packing list.`;
              }, 'Could not add it to the packing list')
              .then((done) => done && setDialog(undefined))
          }
        />
      )}
      {openTask && <OpenTask onChanged={() => trip.reload()} onClose={() => setOpenTask(undefined)} task={openTask} />}
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
      submitLabel="Add item"
      title="Add item"
    >
      <TextField autoComplete="off" autoFocus label="Item" maxLength={200} placeholder="Passport" {...form.field('title')} />
    </FormDialog>
  );
}
