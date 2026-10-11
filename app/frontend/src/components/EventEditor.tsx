import { Dialog, TextAreaField, TextField } from '@project-graphite/ui';
import type { EventDetails } from '../agenda';
import { useAuth } from '../auth';
import { useSpaces } from '../spaces';
import { repeatPresets, reminderPresets } from '../tasks';
import { useAction } from '../useAction';
import { atMost, required, useFormErrors, type Check } from '../validation';

const linkCheck: Check = (value) => (!value.trim() || /^https:\/\/\S+$/.test(value.trim()) ? undefined : 'Use an https:// link.');

export function EventEditor({
  event,
  onClose,
  onSaved,
  onTrashed,
  startsOn,
}: {
  event?: EventDetails;
  onClose: () => void;
  onSaved: (event: EventDetails) => void;
  onTrashed?: () => void;
  startsOn?: string;
}) {
  const auth = useAuth();
  const spaces = useSpaces();
  const saving = useAction();
  const form = useFormErrors();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const custom = event?.repeatRule && !repeatPresets.some(([value]) => value === event.repeatRule);

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
        {!event && (
          <label className="field-label">
            Space
            <select defaultValue={editable[0]?.id} name="spaceId">
              {editable.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">
            Starts
            <input defaultValue={event?.startsOn ?? startsOn} name="startsOn" type="date" />
          </label>
          <label className="field-label">
            Start time (empty for all day)
            <input defaultValue={event?.startTime ?? ''} name="startTime" type="time" />
          </label>
          <label className="field-label">
            Ends
            <input defaultValue={event?.endsOn ?? ''} name="endsOn" type="date" />
          </label>
          <label className="field-label">
            End time
            <input defaultValue={event?.endTime ?? ''} name="endTime" type="time" />
          </label>
          <label className="field-label">
            Repeats
            <select defaultValue={event?.repeatRule ?? ''} name="repeatRule">
              {repeatPresets.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {custom && <option value={event.repeatRule!}>Custom ({event.repeatRule})</option>}
            </select>
          </label>
          <label className="field-label">
            Remind me
            <select defaultValue={event?.reminderMinutes === null || !event ? '' : String(event.reminderMinutes)} name="reminderMinutes">
              {reminderPresets.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TextField defaultValue={event?.location ?? ''} label="Where" maxLength={200} name="location" />
        <TextField defaultValue={event?.meetingUrl ?? ''} inputMode="url" label="Meeting link" {...form.field('meetingUrl')} />
        <TextAreaField defaultValue={event?.description ?? ''} label="Description" maxLength={5000} name="description" rows={3} />
        <div className="flex flex-wrap justify-end gap-3">
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
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={saving.busy || (!event && editable.length === 0)} type="submit">
            {saving.busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
