import { useState } from 'react';
import { Banner, ConfirmDialog, ListRow, Placeholder, Skeleton, TextField, timeAgo } from '@project-graphite/ui';
import { IconButton } from '../components/IconButton';
import { useAuth } from '../auth';
import { connectGoogle, googleAllowed, type GoogleStatus } from '../google';
import { ActionsMenu } from '../components/ActionsMenu';
import { AddButton, Button } from '../components/Button';
import { Copyable } from '../components/Copyable';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { required, useFormErrors } from '../validation';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { ButtonSkeleton, IconButtonSkeleton, RowsSkeleton, useRememberedShape } from '../components/Skeletons';

const emptyCalendars = { title: 'No calendars followed yet', hint: 'Calendars you follow show up here, with when they were last checked.' };

interface FollowedCalendar {
  id: string;
  name: string;
  host: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  events: number;
}

function FollowedCalendars({ following, onClose }: { following: boolean; onClose: () => void }) {
  const auth = useAuth();
  const calendars = useResource<FollowedCalendar[]>('/me/calendars', true);
  const action = useAction();
  const form = useFormErrors();
  const [stopping, setStopping] = useState<FollowedCalendar>();
  const [rows, failedRows] = useRememberedShape(
    'followed-calendars',
    calendars.data && [calendars.data.length, calendars.data.filter((calendar) => calendar.lastError).length],
    [0, 0],
  );

  if (calendars.error) return <LoadError compact error={calendars.error} onRetry={calendars.reload} />;
  if (!calendars.data) {
    return (
      <Placeholder label="Loading followed calendars">
        {rows ? (
          <RowsSkeleton below={<Skeleton className="h-12 rounded-field" />} belowRows={failedRows} rows={rows} trail={<IconButtonSkeleton />} />
        ) : (
          <Empty loading title={emptyCalendars.title}>
            {emptyCalendars.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }
  const replace = (saved: FollowedCalendar) => calendars.mutate((current) => current.map((calendar) => (calendar.id === saved.id ? saved : calendar)));

  return (
    <>
      {calendars.data.length === 0 ? (
        <Empty title={emptyCalendars.title}>{emptyCalendars.hint}</Empty>
      ) : (
        <ul className="panel-rows">
          {calendars.data.map((calendar) => (
              <ListRow
                key={calendar.id}
                meta={
                  <>
                    {calendar.host} · {calendar.events} event{calendar.events === 1 ? '' : 's'}
                    {calendar.lastFetchedAt ? ` · checked ${timeAgo(calendar.lastFetchedAt)}` : ''}
                  </>
                }
                title={calendar.name}
                trail={
                  (
                    <ActionsMenu
                      items={[
                        {
                          label: 'Check now',
                          onSelect: () =>
                            void action.run(async () => {
                              replace(await auth.request<FollowedCalendar>(`/calendars/${calendar.id}/refresh`, { method: 'POST' }));
                              return `Checked ${calendar.name}.`;
                            }, 'Could not check the calendar'),
                        },
                        { label: 'Stop following', separated: true, onSelect: () => setStopping(calendar) },
                      ]}
                      name={calendar.name}
                    />
                  )
                }
              >
                {calendar.lastError && <Banner tone="danger">The last check failed: {calendar.lastError}</Banner>}
              </ListRow>
          ))}
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
                const added = await auth.request<FollowedCalendar>('/me/calendars', {
                  method: 'POST',
                  body: JSON.stringify({ url: String(values.get('url')).trim(), ...(name ? { name } : {}) }),
                });
                calendars.mutate((current) => [...current, added]);
                return `Followed ${added.name}.`;
              }, 'Could not follow that calendar')
              .then((done) => done && onClose());
          }}
          submitLabel="Follow calendar"
          title="Follow a calendar"
        >
          <TextField autoFocus inputMode="url" label="Calendar address" {...form.field('url')} />
          <TextField label="Name (optional)" maxLength={80} {...form.field('name')} />
        </FormDialog>
      )}
      {stopping && (
        <ConfirmDialog
          busyLabel="Stopping…"
          confirmLabel="Stop following"
          errorFallback="Could not stop following the calendar"
          onClose={() => setStopping(undefined)}
          onConfirm={async () => {
            await auth.request(`/calendars/${stopping.id}`, { method: 'DELETE' });
            calendars.mutate((current) => current.filter((shown) => shown.id !== stopping.id));
            action.report(`Stopped following ${stopping.name}.`);
          }}
          title={`Stop following ${stopping.name}?`}
          tone="danger"
        >
          Its events disappear from your Agenda.
        </ConfirmDialog>
      )}
    </>
  );
}

interface GoogleCalendarRow {
  id: string | null;
  calendarId: string;
  name: string;
  writable: boolean;
  isDefault: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  synced: boolean;
  events: number;
}

interface GoogleCalendars {
  connected: boolean;
  error: string | null;
  calendars: GoogleCalendarRow[];
}

function googleMeta(calendar: GoogleCalendarRow) {
  if (!calendar.synced) return calendar.writable ? 'Not synced' : 'Not synced · view only';
  return [
    `${calendar.events} event${calendar.events === 1 ? '' : 's'}`,
    calendar.lastSyncedAt ? `synced ${timeAgo(calendar.lastSyncedAt)}` : 'waiting for the first sync',
    calendar.isDefault ? 'new Strata events go here' : !calendar.writable && 'view only',
  ]
    .filter(Boolean)
    .join(' · ');
}

function GoogleCalendarsSection() {
  const auth = useAuth();
  const status = useResource<GoogleStatus>(googleAllowed ? '/me/google' : null, true);
  const calendars = useResource<GoogleCalendars>(status.data?.account?.calendar ? '/me/google/calendars' : null, true);
  const action = useAction();
  const [stopping, setStopping] = useState<GoogleCalendarRow>();

  if (!status.data?.available) return null;
  const save = (path: string, method: string, body: unknown, done: string) =>
    void action.run(async () => {
      const next = await auth.request<GoogleCalendars>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      calendars.mutate(() => next);
      return done;
    }, 'Could not change Google Calendar sync');
  const connect = () =>
    void action.run(async () => {
      await connectGoogle(auth.request, 'calendar', '/agenda/calendars');
      return '';
    }, 'Could not open Google');

  return (
    <Section
      action={
        status.data.account?.calendar ? (
          <IconButton disabled={action.busy} icon="refresh" label="Sync Google Calendar now" onClick={() => save('/me/google/calendars/sync', 'POST', null, 'Synced with Google Calendar.')} />
        ) : (
          <IconButton disabled={action.busy} icon="link" label="Connect Google Calendar" onClick={connect} />
        )
      }
      description="Events from the Google calendars you sync appear in your Agenda, and events you add or change in Strata go to your default Google calendar. Changes on either side arrive within a few minutes."
      title="Google Calendar"
    >
      {!status.data.account?.calendar ? (
        <Empty title="Google Calendar isn’t connected">Connect it to choose which of your Google calendars to sync.</Empty>
      ) : calendars.error ? (
        <LoadError compact error={calendars.error} onRetry={calendars.reload} />
      ) : !calendars.data ? (
        <Placeholder label="Loading your Google calendars">
          <RowsSkeleton rows={2} trail={<IconButtonSkeleton />} />
        </Placeholder>
      ) : (
        <>
          {calendars.data.error && <Banner tone="danger">{calendars.data.error}</Banner>}
          <ul className="panel-rows">
            {calendars.data.calendars.map((calendar) => (
              <ListRow
                key={calendar.calendarId}
                meta={googleMeta(calendar)}
                title={calendar.name}
                trail={
                  calendar.id ? (
                    <ActionsMenu
                      items={[
                        ...(calendar.writable && !calendar.isDefault
                          ? [{ label: 'Send new Strata events here', onSelect: () => save(`/me/google/calendars/${calendar.id}/default`, 'POST', null, `New Strata events now go to ${calendar.name}.`) }]
                          : []),
                        { label: 'Stop syncing', separated: true, onSelect: () => setStopping(calendar) },
                      ]}
                      name={calendar.name}
                    />
                  ) : (
                    <IconButton
                      disabled={action.busy}
                      icon="plus"
                      label={`Sync ${calendar.name}`}
                      onClick={() => save('/me/google/calendars', 'POST', { calendarId: calendar.calendarId }, `Syncing ${calendar.name}. Its events appear in a few moments.`)}
                    />
                  )
                }
              >
                {calendar.lastError && <Banner tone="danger">The last sync failed: {calendar.lastError}</Banner>}
              </ListRow>
            ))}
          </ul>
        </>
      )}
      {stopping?.id && (
        <ConfirmDialog
          busyLabel="Stopping…"
          confirmLabel="Stop syncing"
          errorFallback="Could not stop syncing the calendar"
          onClose={() => setStopping(undefined)}
          onConfirm={async () => {
            await auth.request(`/me/google/calendars/${stopping.id}`, { method: 'DELETE' });
            calendars.reload();
            action.report(`Stopped syncing ${stopping.name}.`);
          }}
          title={`Stop syncing ${stopping.name}?`}
          tone="danger"
        >
          Events Strata brought in from it move to the trash. Events you made in Strata stay, and stay in Google.
        </ConfirmDialog>
      )}
    </Section>
  );
}

export function CalendarsPage() {
  const auth = useAuth();
  const [following, setFollowing] = useState(false);
  const feed = useResource<{ enabled: boolean }>('/me/calendar-feed', true);
  const action = useAction();
  const [url, setUrl] = useState('');
  const [resetting, setResetting] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  const [feedEnabled] = useRememberedShape('calendar-feed', feed.data && [Number(feed.data.enabled)], [0]);

  return (
    <Page
      actions={<AddButton label="Follow a calendar" large onClick={() => setFollowing(true)} primary />}
      back={{ to: '/agenda', label: 'Agenda' }}
      title="Calendars"
    >
      <Section
        description="Subscribe to this link in Google Calendar, Apple Calendar or Outlook to see your events there. Anyone with the link can see them, so keep it private."
        title="Your agenda in other apps"
      >
        {feed.error ? (
          <LoadError compact error={feed.error} onRetry={feed.reload} />
        ) : !feed.data ? (
          <Placeholder className="flex flex-wrap gap-2" label="Loading your calendar link">
            {feedEnabled ? (
              <>
                <ButtonSkeleton width="w-36" />
                <ButtonSkeleton width="w-36" />
              </>
            ) : (
              <ButtonSkeleton width="w-48" />
            )}
          </Placeholder>
        ) : url ? (
          <div className="grid gap-2">
            <Copyable value={url} />
            <Hint>Copy it now. It’s shown only once.</Hint>
          </div>
        ) : feed.data.enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button disabled={action.busy} label="Make a new link" onClick={() => setResetting(true)} />
            <Button disabled={action.busy} label="Turn the link off" onClick={() => setTurningOff(true)} />
          </div>
        ) : (
          <Button
            disabled={action.busy}
            icon="link"
            label="Create a calendar link"
            onClick={() =>
              void action.run(async () => {
                const created = await auth.request<{ enabled: boolean; url: string }>('/me/calendar-feed', { method: 'POST' });
                setUrl(created.url);
                feed.mutate(() => ({ enabled: true }));
                return 'Created a calendar link.';
              }, 'Could not create the link')
            }
          />
        )}
      </Section>
      <GoogleCalendarsSection />
      <Section
        description="Follow a public calendar, such as holidays, fixtures or a shared Google calendar’s secret address. Its events appear in your Agenda, read-only. They are checked again whenever you open the Agenda, and every 15 minutes otherwise."
        title="Calendars from elsewhere"
      >
        <FollowedCalendars following={following} onClose={() => setFollowing(false)} />
      </Section>
      {resetting && (
        <ConfirmDialog
          busyLabel="Making…"
          confirmLabel="Make a new link"
          errorFallback="Could not make a new link"
          onClose={() => setResetting(false)}
          onConfirm={async () => {
            const created = await auth.request<{ enabled: boolean; url: string }>('/me/calendar-feed', { method: 'POST' });
            setUrl(created.url);
            action.report('Made a new calendar link.');
          }}
          title="Make a new calendar link?"
          tone="danger"
        >
          The old link stops working, so calendars subscribed to it stop updating.
        </ConfirmDialog>
      )}
      {turningOff && (
        <ConfirmDialog
          busyLabel="Turning off…"
          confirmLabel="Turn off link"
          errorFallback="Could not turn the link off"
          onClose={() => setTurningOff(false)}
          onConfirm={async () => {
            await auth.request('/me/calendar-feed', { method: 'DELETE' });
            feed.mutate(() => ({ enabled: false }));
            action.report('Turned off the calendar link.');
          }}
          title="Turn off this link?"
          tone="danger"
        >
          Calendars subscribed to it stop showing your events.
        </ConfirmDialog>
      )}
    </Page>
  );
}
