import { useState } from 'react';
import { ConfirmDialog, ListSkeleton, PageHeader, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { LoadError } from '../components/LoadError';
import { useSpaces } from '../spaces';
import { required, useFormErrors } from '../validation';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

interface FollowedCalendar {
  id: string;
  spaceId: string;
  name: string;
  host: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  events: number;
}

function FollowedCalendars() {
  const auth = useAuth();
  const spaces = useSpaces();
  const calendars = useResource<FollowedCalendar[]>('/me/calendars', true);
  const action = useAction();
  const form = useFormErrors();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const [spaceId, setSpaceId] = useState('');
  const chosenSpace = spaceId || editable[0]?.id || '';

  if (calendars.error) return <LoadError compact error={calendars.error} onRetry={calendars.reload} />;
  if (!calendars.data) return <ListSkeleton label="Loading followed calendars" rows={2} />;
  const replace = (saved: FollowedCalendar) => calendars.mutate((current) => current.map((calendar) => (calendar.id === saved.id ? saved : calendar)));

  return (
    <div className="grid gap-4">
      {calendars.data.length > 0 && (
        <ul className="m-0 grid list-none gap-0 p-0">
          {calendars.data.map((calendar) => {
            const space = spaces.data?.find((candidate) => candidate.id === calendar.spaceId);
            return (
              <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-3" key={calendar.id}>
                <div className="min-w-0">
                  <p className="m-0 truncate text-ink">{calendar.name}</p>
                  <p className="mono-sm m-0 mt-0.5 text-faint">
                    {space?.name} · {calendar.host} · {calendar.events} event{calendar.events === 1 ? '' : 's'}
                    {calendar.lastFetchedAt ? ` · checked ${timeAgo(calendar.lastFetchedAt)}` : ''}
                  </p>
                  {calendar.lastError && <p className="m-0 mt-0.5 text-sm text-muted">The last check failed: {calendar.lastError}</p>}
                </div>
                {space && space.role !== 'viewer' && (
                  <div className="flex gap-2">
                    <button
                      className="secondary-button px-3 py-1.5 text-sm"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          replace(await auth.request<FollowedCalendar>(`/calendars/${calendar.id}/refresh`, { method: 'POST' }));
                          return '';
                        }, 'Could not check the calendar')
                      }
                      type="button"
                    >
                      Check now
                    </button>
                    <button
                      className="text-button text-sm"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await auth.request(`/calendars/${calendar.id}`, { method: 'DELETE' });
                          calendars.mutate((current) => current.filter((shown) => shown.id !== calendar.id));
                          return `${calendar.name} is no longer followed.`;
                        }, 'Could not stop following the calendar')
                      }
                      type="button"
                    >
                      Stop following
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable.length > 0 && (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(submitted) => {
            submitted.preventDefault();
            const target = submitted.currentTarget;
            if (!form.check(target, { url: [required('Enter the calendar’s address.')] })) return;
            const values = new FormData(target);
            const name = String(values.get('name')).trim();
            void action
              .run(async () => {
                const added = await auth.request<FollowedCalendar>(`/spaces/${chosenSpace}/calendars`, {
                  method: 'POST',
                  body: JSON.stringify({ url: String(values.get('url')).trim(), ...(name ? { name } : {}) }),
                });
                calendars.mutate((current) => [...current, added]);
                return `Following ${added.name}.`;
              }, 'Could not follow that calendar')
              .then((done) => done && target.reset());
          }}
        >
          <h3 className="m-0 text-base font-medium">Follow a calendar</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField inputMode="url" label="Calendar address (https:// or webcal://)" {...form.field('url')} />
            <TextField label="Name (optional)" maxLength={80} {...form.field('name')} />
          </div>
          {editable.length > 1 && (
            <label className="field-label grid gap-1">
              Show it in
              <select onChange={(event) => setSpaceId(event.currentTarget.value)} value={chosenSpace}>
                {editable.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="primary-button w-fit px-3 py-2 text-sm" disabled={action.busy} type="submit">
            Follow
          </button>
        </form>
      )}
    </div>
  );
}

export function CalendarsPage() {
  const auth = useAuth();
  const feed = useResource<{ enabled: boolean }>('/me/calendar-feed', true);
  const action = useAction();
  const [url, setUrl] = useState('');
  const [resetting, setResetting] = useState(false);

  function create() {
    void action.run(async () => {
      const created = await auth.request<{ enabled: boolean; url: string }>('/me/calendar-feed', { method: 'POST' });
      setUrl(created.url);
      feed.mutate(() => ({ enabled: true }));
      return '';
    }, 'Could not create the link');
  }

  return (
    <section className="page-enter grid max-w-3xl gap-8">
      <PageHeader eyebrow="Agenda" title="Calendars" />
      <section className="grid gap-3">
        <h2 className="m-0 text-xl font-medium">Your agenda in other apps</h2>
        <p className="m-0 text-sm text-muted">
          Subscribe to this link in Google Calendar, Apple Calendar or Outlook to see the events of all your spaces there. Anyone with the link can see them, so keep it
          private.
        </p>
        {feed.error ? (
          <LoadError compact error={feed.error} onRetry={feed.reload} />
        ) : !feed.data ? (
          <ListSkeleton label="Loading your calendar link" rows={1} />
        ) : url ? (
          <div className="grid gap-2">
            <p className="m-0 text-sm text-ink">Copy it now. It is shown only once.</p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="mono-sm break-all text-ink">{url}</code>
              <button className="secondary-button px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(url)} type="button">
                Copy link
              </button>
            </div>
          </div>
        ) : feed.data.enabled ? (
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button px-3 py-2 text-sm" disabled={action.busy} onClick={() => setResetting(true)} type="button">
              Make a new link
            </button>
            <button
              className="text-button text-sm"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await auth.request('/me/calendar-feed', { method: 'DELETE' });
                  feed.mutate(() => ({ enabled: false }));
                  return 'The calendar link is turned off.';
                }, 'Could not turn the link off')
              }
              type="button"
            >
              Turn the link off
            </button>
          </div>
        ) : (
          <button className="primary-button w-fit px-3 py-2 text-sm" disabled={action.busy} onClick={create} type="button">
            Create a calendar link
          </button>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="m-0 text-xl font-medium">Calendars from elsewhere</h2>
        <p className="m-0 text-sm text-muted">
          Follow a public calendar, such as holidays, fixtures or a shared Google calendar’s secret address. Its events appear in the Agenda for everyone in the space,
          read-only, and are checked every 6 hours.
        </p>
        <FollowedCalendars />
      </section>
      {resetting && (
        <ConfirmDialog
          confirmLabel="Make a new link"
          errorFallback="Could not make a new link"
          onClose={() => setResetting(false)}
          onConfirm={async () => {
            const created = await auth.request<{ enabled: boolean; url: string }>('/me/calendar-feed', { method: 'POST' });
            setUrl(created.url);
            setResetting(false);
          }}
          title="Make a new calendar link?"
        >
          <p className="m-0 text-sm text-muted">The old link stops working, so calendars subscribed to it stop updating.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
