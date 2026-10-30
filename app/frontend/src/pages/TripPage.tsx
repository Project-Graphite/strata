import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon, ListRow, type MenuItem, Meter, Skeleton, TextField } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { EventEditor } from '../components/EventEditor';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { FileButton } from '../components/FileButton';
import { FormDialog } from '../components/FormDialog';
import { DetailState, Page, Section } from '../components/Page';
import { ButtonSkeleton, IconSkeleton, RowsSkeleton, SkeletonLine, TaskRowsSkeleton, useRememberedShape } from '../components/Skeletons';
import { MissingRates } from '../components/Stats';
import { OpenTask } from '../components/OpenTask';
import { TripEditor } from '../components/TripEditor';
import { fileSize, maxUploadBytes, saveBlob, uploadFile } from '../files';
import { categoryName, type MoneyAccount } from '../spending';
import { usePersonalSpace, useSpaces } from '../spaces';
import { money } from '../subscriptions';
import { taskDetails, TaskRow, type Task } from '../tasks';
import { tripDates, type TripDetail } from '../trips';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { atMost, required, useFormErrors } from '../validation';
import { capitalised, clockTime, formatDate } from '../time';

const empties = {
  itinerary: { title: 'No events yet', hint: 'Add the flights, stays and plans for this trip to see them day by day.' },
  packing: { title: 'Nothing to pack yet', hint: 'Add what to bring and tick it off as it goes in the bag.' },
  documents: { title: 'No documents yet', hint: 'Upload tickets, bookings and passports to keep them with the trip.' },
  pages: { title: 'No pages yet', hint: 'Start a page for notes and ideas about this trip.' },
};

export function TripPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const trip = useResource<TripDetail>(`/trips/${id}`, true);
  const action = useAction();
  const [dialog, setDialog] = useState<'edit' | 'event' | 'pack' | 'expense'>();
  const [openTask, setOpenTask] = useState<Task>();
  const personal = usePersonalSpace().spaceId;
  const accounts = useResource<MoneyAccount[]>(personal ? `/spaces/${personal}/accounts` : null, true);

  const space = spaces.data?.find((candidate) => candidate.id === trip.data?.spaceId);
  const editable = Boolean(space && space.role !== 'viewer');
  const itinerary = trip.data?.itinerary ?? [];
  const days = [...new Set(itinerary.map((entry) => entry.startsOn))];
  const [wasEditable, packing, packRows, detailedPacks, budgeted, expenseRows, documentRows, pageRows, ...dayRows] = useRememberedShape(
    `trip-${id}`,
    trip.data &&
      spaces.data && [
        Number(editable),
        Number(trip.data.packing !== null),
        trip.data.packing?.tasks.length ?? 0,
        trip.data.packing?.tasks.filter((task) => taskDetails(task).length > 0).length ?? 0,
        Number(trip.data.budgetMinor !== null),
        trip.data.expenses.length,
        trip.data.documents.length,
        trip.data.pages.length,
        ...days.map((day) => itinerary.filter((entry) => entry.startsOn === day).length),
      ],
    [1, 0, 0, 0, 0, 0, 0, 0, 2],
  );

  const back = { to: '/trips', label: 'Trips' };
  if (!trip.data) {
    return (
      <DetailState back={back} menu={wasEditable > 0} primary={wasEditable > 0 && 'Edit'} resource={trip} thing="Trip">
        <Section action={wasEditable > 0 && <ButtonSkeleton width="w-28" />} title="Itinerary">
          {dayRows.length ? (
            <div className="grid gap-4">
              {dayRows.map((rows, day) => (
                <div className="grid gap-3" key={day}>
                  <SkeletonLine className="text-h3" width="w-24" />
                  <RowsSkeleton rows={rows} />
                </div>
              ))}
            </div>
          ) : (
            <Empty loading title={empties.itinerary.title}>
              {empties.itinerary.hint}
            </Empty>
          )}
        </Section>
        {packing > 0 && (
          <Section action={wasEditable > 0 && <ButtonSkeleton width="w-24" />} description={packRows > 0 && <SkeletonLine width="w-24" />} title="Packing">
            {packRows ? (
              <TaskRowsSkeleton detailed={detailedPacks} rows={packRows} />
            ) : (
              <Empty loading title={empties.packing.title}>
                {empties.packing.hint}
              </Empty>
            )}
          </Section>
        )}
        <Section action={wasEditable > 0 && <ButtonSkeleton width="w-32" />} title="Spending">
          <div className="grid gap-2">
            <SkeletonLine width="w-40" />
            {budgeted > 0 && <Skeleton className="h-1.5 rounded-full" />}
          </div>
          {expenseRows > 0 && <RowsSkeleton rows={expenseRows} trail={<SkeletonLine className="shrink-0" width="w-16" />} />}
        </Section>
        <Section action={wasEditable > 0 && <ButtonSkeleton width="w-24" />} title="Documents">
          {documentRows ? (
            <RowsSkeleton lead={<IconSkeleton />} rows={documentRows} />
          ) : (
            <Empty loading title={empties.documents.title}>
              {empties.documents.hint}
            </Empty>
          )}
        </Section>
        <Section action={wasEditable > 0 && <ButtonSkeleton width="w-28" />} title="Pages">
          {pageRows ? (
            <RowsSkeleton detail={false} lead={<IconSkeleton />} rows={pageRows} />
          ) : (
            <Empty loading title={empties.pages.title}>
              {empties.pages.hint}
            </Empty>
          )}
        </Section>
      </DetailState>
    );
  }
  const shown = trip.data;

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

  const packed = shown.packing?.tasks.filter((task) => task.completedAt).length ?? 0;
  const budgetCurrency = shown.currency ?? shown.spending.currency;

  return (
    <Page
      actions={
        editable && (
          <>
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
            <Button icon="pencil" label="Edit" large onClick={() => setDialog('edit')} primary />
          </>
        )
      }
      back={back}
      description={[shown.spaceName, shown.destination, tripDates(shown)].filter(Boolean).join(' · ')}
      title={shown.title}
    >
      <Section action={editable && <Button icon="plus" label="New event" onClick={() => setDialog('event')} />} title="Itinerary">
        {days.length === 0 ? (
          <Empty title={empties.itinerary.title}>{empties.itinerary.hint}</Empty>
        ) : (
          <div className="grid gap-4">
            {days.map((day) => (
              <Section key={day} level={3} title={capitalised(formatDate(day))}>
                <ul className="panel-rows">
                  {itinerary
                    .filter((entry) => entry.startsOn === day)
                    .map((entry) => (
                      <ListRow
                        href={`/events/${entry.id}`}
                        key={entry.linkId}
                        meta={[entry.startTime ? `${clockTime(entry.startTime)}${entry.endTime ? `–${clockTime(entry.endTime)}` : ''}` : 'All day', entry.location].filter(Boolean).join(' · ')}
                        title={entry.title}
                        trail={linkedMenu(entry)}
                      />
                    ))}
                </ul>
              </Section>
            ))}
          </div>
        )}
      </Section>

      {shown.packing && (
        <Section
          action={editable && <Button icon="plus" label="Add item" onClick={() => setDialog('pack')} />}
          description={shown.packing.tasks.length ? `${packed} of ${shown.packing.tasks.length} packed` : undefined}
          title="Packing"
        >
          {shown.packing.tasks.length === 0 ? (
            <Empty title={empties.packing.title}>{empties.packing.hint}</Empty>
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

      <Section action={editable && <Button icon="plus" label="New expense" onClick={() => setDialog('expense')} />} title="Spending">
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
              <ListRow
                key={expense.linkId}
                meta={`${capitalised(formatDate(expense.spentOn))} · ${categoryName(expense.category)}`}
                title={expense.title}
                trail={
                  <>
                    <Amount currency={expense.currency} minor={expense.amountMinor} />
                    {linkedMenu(expense)}
                  </>
                }
              />
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
          <Empty title={empties.documents.title}>{empties.documents.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {shown.documents.map((document) => (
              <ListRow
                key={document.linkId}
                lead={<Icon name="file" size={18} />}
                meta={document.sizeBytes !== null && fileSize(document.sizeBytes)}
                title={document.title}
                trail={linkedMenu(document, [
                  {
                    label: 'Download',
                    onSelect: () =>
                      void action.run(async () => {
                        saveBlob(await auth.request<Blob>(`/files/${document.id}`, {}, readBlob), document.title);
                        return '';
                      }, 'Could not download that file'),
                  },
                ])}
              />
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
          <Empty title={empties.pages.title}>{empties.pages.hint}</Empty>
        ) : (
          <ul className="panel-rows">
            {shown.pages.map((page) => (
              <ListRow
                href={`/notes/${page.id}`}
                key={page.linkId}
                lead={<Icon name="file" size={18} />}
                title={page.title || 'Untitled'}
                trail={linkedMenu({ ...page, title: page.title || 'Untitled' })}
              />
            ))}
          </ul>
        )}
      </Section>

      {dialog === 'edit' && space && <TripEditor onClose={() => setDialog(undefined)} onSaved={() => trip.reload()} spaces={[space]} trip={shown} />}
      {dialog === 'event' && <EventEditor onClose={() => setDialog(undefined)} onSaved={(event) => addToTrip(event.id)} spaceId={shown.spaceId} startsOn={shown.startsOn} />}
      {dialog === 'expense' && personal && <ExpenseEditor accounts={accounts.data ?? []} currency={budgetCurrency} onClose={() => setDialog(undefined)} onSaved={(expense) => addToTrip(expense.id)} spaceId={personal} />}
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
