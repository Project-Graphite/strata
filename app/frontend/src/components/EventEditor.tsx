import { DatePicker, Dialog, Select, TextAreaField, TextField } from '@project-graphite/ui';
import type { EventDetails } from '../agenda';
import { useAuth } from '../auth';
import { spaceOptions, useSpaces } from '../spaces';
import { reminderOptions, repeatOptions } from '../tasks';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors, type Check } from '../validation';
import { TimeField } from '../time';
import { Button } from './Button';
import { DialogActions } from './DialogActions';

const linkCheck: Check = (value) => (!value.trim() || /^https:\/\/\S+$/.test(value.trim()) ? undefined : 'Use an https:// link.');

export function EventEditor({
  event,
  onClose,
  onSaved,
  onTrashed,
  spaceId,
  startsOn,
}: {
  event?: EventDetails;
  onClose: () => void;
  onSaved: (event: EventDetails) => void;
  onTrashed?: () => void;
  spaceId?: string;
  startsOn?: string;
}) {
  const auth = useAuth();
  const spaces = useSpaces();
  const saving = useAction();
  const form = useFormErrors();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  return (
    <Dialog onClose={onClose} title={event ? `Edit ${event.title}` : 'New event'}>
      <form
        className="mt-5 grid gap-4"
        noValidate
        onSubmit={(submitted) => {
          submitted.preventDefault();
          const target = submitted.currentTarget;
          if (
            !form.check(target, {
              title: [required('Give the event a title.'), atMost(200, 'Use at most 200 characters.')],
              startsOn: [required('Choose a date.')],
              meetingUrl: [linkCheck],
            })
          ) {
            return;
          }
          const values = new FormData(target);
          const text = (name: string) => String(values.get(name) ?? '').trim();
          const reminder = text('reminderMinutes');
          void saving
            .run(async () => {
              const saved = await auth.request<EventDetails>(event ? `/events/${event.id}` : `/spaces/${text('spaceId')}/events`, {
                method: event ? 'PATCH' : 'POST',
                body: JSON.stringify({
                  title: text('title'),
                  startsOn: text('startsOn'),
                  startTime: text('startTime') || null,
                  endsOn: text('endsOn') || text('startsOn'),
                  endTime: text('endTime') || null,
                  repeatRule: text('repeatRule') || null,
                  location: text('location') || null,
                  meetingUrl: text('meetingUrl') || null,
                  description: text('description'),
                  reminderMinutes: reminder ? Number(reminder) : null,
                }),
              });
              onSaved(saved);
              return '';
            }, 'Could not save the event')
            .then((saved) => saved && onClose());
        }}
      >
        <TextField defaultValue={event?.title} label="Title" maxLength={200} {...form.field('title')} />
        {!event && spaceId && <input name="spaceId" type="hidden" value={spaceId} />}
        {!event && !spaceId && (
          <Select
            defaultValue={editable[0]?.id}
            label="Space"
            name="spaceId"
            options={spaceOptions(editable)}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            defaultValue={event?.startsOn ?? startsOn ?? ''}
            error={form.errors.startsOn}
            label="Starts"
            name="startsOn"
            onChange={form.field('startsOn').onInput}
            optional={false}
          />
          <TimeField defaultValue={event?.startTime ?? ''} emptyLabel="All day" label="Start time" name="startTime" />
          <DatePicker defaultValue={event?.endsOn ?? ''} label="Ends" name="endsOn" placeholder="Same day" />
          <TimeField defaultValue={event?.endTime ?? ''} emptyLabel="No end time" label="End time" name="endTime" />
          <Select defaultValue={event?.repeatRule ?? ''} label="Repeats" name="repeatRule" options={repeatOptions(event?.repeatRule)} />
          <Select defaultValue={event?.reminderMinutes == null ? '' : String(event.reminderMinutes)} label="Remind me" name="reminderMinutes" options={reminderOptions(event?.reminderMinutes)} />
        </div>
        <TextField defaultValue={event?.location ?? ''} label="Where" maxLength={200} name="location" />
        <TextField defaultValue={event?.meetingUrl ?? ''} inputMode="url" label="Meeting link" {...form.field('meetingUrl')} />
        <TextAreaField defaultValue={event?.description ?? ''} label="Description" maxLength={5000} name="description" rows={3} />
        <DialogActions>
          {event && onTrashed && (
            <button
              className="text-button mr-auto text-sm"
              disabled={saving.busy}
              onClick={() =>
                void saving.run(async () => {
                  await auth.request(`/items/${event.id}/trash`, { method: 'POST' });
                  onTrashed();
                  return `Moved ${event.title} to the trash.`;
                }, 'Could not move the event to the trash')
              }
              type="button"
            >
              Move to trash
            </button>
          )}
          <Button label="Cancel" large onClick={onClose} />
          <Button disabled={saving.busy || (!event && editable.length === 0)} label={saving.busy ? 'Saving…' : 'Save'} large primary submit />
        </DialogActions>
      </form>
    </Dialog>
  );
}
