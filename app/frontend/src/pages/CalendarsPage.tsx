import { useState } from 'react';
import { ConfirmDialog, Icon, ListSkeleton, Select, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { CopyLink } from '../components/CopyLink';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page, Section } from '../components/Page';
import { spaceOptions, useSpaces } from '../spaces';
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

function FollowedCalendars({ following, onClose }: { following: boolean; onClose: () => void }) {
  const auth = useAuth();
  const spaces = useSpaces();
  const calendars = useResource<FollowedCalendar[]>('/me/calendars', true);
  const action = useAction();
  const form = useFormErrors();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');

  if (calendars.error) return <LoadError compact error={calendars.error} onRetry={calendars.reload} />;
  if (!calendars.data) return <ListSkeleton label="Loading followed calendars" rows={2} />;
  const replace = (saved: FollowedCalendar) => calendars.mutate((current) => current.map((calendar) => (calendar.id === saved.id ? saved : calendar)));

  return (
    <>
      {calendars.data.length === 0 ? (
        <Hint>You don’t follow any calendars yet.</Hint>
      ) : (
        <ul className="panel-rows">
          {calendars.data.map((calendar) => {
            const space = spaces.data?.find((candidate) => candidate.id === calendar.spaceId);
            return (
              <li className="panel-row flex flex-wrap items-center justify-between gap-3" key={calendar.id}>
                <div className="min-w-0">
                  <p className="m-0 truncate text-ink">{calendar.name}</p>
                  <p className="m-0 mt-0.5 text-sm text-muted">
                    {space?.name} · {calendar.host} · {calendar.events} event{calendar.events === 1 ? '' : 's'}
                    {calendar.lastFetchedAt ? ` · checked ${timeAgo(calendar.lastFetchedAt)}` : ''}
                  </p>
                  {calendar.lastError && <p className="m-0 mt-0.5 text-sm text-danger">The last check failed: {calendar.lastError}</p>}
                </div>
                {space && space.role !== 'viewer' && (
                  <div className="flex gap-2">
                    <button
                      className="secondary-button px-3 py-2 text-sm"
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
                      className="secondary-button px-3 py-2 text-sm"
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
      {following && (
        <FormDialog
          busy={action.busy}
          busyLabel="Following…"
          onClose={onClose}
          onSubmit={(target) => {
            if (!form.check(target, { url: [required('Enter the calendar’s address.')] })) return;
            const values = new FormData(target);
            const name = String(values.get('name')).trim();
            void action
              .run(async () => {
                const added = await auth.request<FollowedCalendar>(`/spaces/${String(values.get('spaceId'))}/calendars`, {
                  method: 'POST',
                  body: JSON.stringify({ url: String(values.get('url')).trim(), ...(name ? { name } : {}) }),
                });
                calendars.mutate((current) => [...current, added]);
                return `Following ${added.name}.`;
              }, 'Could not follow that calendar')
              .then((done) => done && onClose());
          }}
          submitLabel="Follow"
          title="Follow a calendar"
        >
          <TextField autoFocus hint="An https:// or webcal:// address." inputMode="url" label="Calendar address" {...form.field('url')} />
          <TextField label="Name (optional)" maxLength={80} {...form.field('name')} />
          {editable.length > 1 ? (
            <Select defaultValue={editable[0]!.id} label="Show it in" name="spaceId" options={spaceOptions(editable)} />
          ) : (
            <input name="spaceId" type="hidden" value={editable[0]?.id ?? ''} />
          )}
        </FormDialog>
      )}
    </>
  );
}

export function CalendarsPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const editable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const [following, setFollowing] = useState(false);
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
    <Page actions={editable.length > 0 && <HeaderButton icon="plus" label="Follow a calendar" onClick={() => setFollowing(true)} primary />} eyebrow="Agenda" title="Calendars">
      <Section
        description="Subscribe to this link in Google Calendar, Apple Calendar or Outlook to see the events of all your spaces there. Anyone with the link can see them, so keep it private."
        title="Your agenda in other apps"
      >
        {feed.error ? (
          <LoadError compact error={feed.error} onRetry={feed.reload} />
        ) : !feed.data ? (
          <ListSkeleton label="Loading your calendar link" rows={1} />
        ) : url ? (
          <div className="grid gap-2">
            <CopyLink link={url} />
            <Hint>Copy it now. It is shown only once.</Hint>
          </div>
        ) : feed.data.enabled ? (
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button px-3 py-2 text-sm" disabled={action.busy} onClick={() => setResetting(true)} type="button">
              Make a new link
            </button>
            <button
              className="secondary-button px-3 py-2 text-sm"
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
          <button className="secondary-button w-fit px-3 py-2 text-sm" disabled={action.busy} onClick={create} type="button">
            <Icon name="link" size={16} />
            Create a calendar link
          </button>
        )}
      </Section>
      <Section
        description="Follow a public calendar, such as holidays, fixtures or a shared Google calendar’s secret address. Its events appear in the Agenda for everyone in the space, read-only. They are checked again whenever you open the Agenda, and every 15 minutes otherwise."
        title="Calendars from elsewhere"
      >
        <FollowedCalendars following={following} onClose={() => setFollowing(false)} />
      </Section>
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
          <Hint>The old link stops working, so calendars subscribed to it stop updating.</Hint>
        </ConfirmDialog>
      )}
    </Page>
  );
}
