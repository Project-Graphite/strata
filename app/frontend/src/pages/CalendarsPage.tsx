import { useState } from 'react';
import { ConfirmDialog, ListSkeleton, Select, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Button } from '../components/Button';
import { Copyable } from '../components/Copyable';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { spaceOptions, useSpaces } from '../spaces';
import { required, useFormErrors } from '../validation';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { RowText } from '../components/RowText';

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
  const [stopping, setStopping] = useState<FollowedCalendar>();
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
                <RowText
                  detail={
                    <>
                      {space?.name} · {calendar.host} · {calendar.events} event{calendar.events === 1 ? '' : 's'}
                      {calendar.lastFetchedAt ? ` · checked ${timeAgo(calendar.lastFetchedAt)}` : ''}
                    </>
                  }
                  title={calendar.name}
                >
                  {calendar.lastError && <span className="text-sm text-danger">The last check failed: {calendar.lastError}</span>}
                </RowText>
                {space && space.role !== 'viewer' && (
                  <div className="flex gap-2">
                    <Button
                      disabled={action.busy}
                      label="Check now"
                      onClick={() =>
                        void action.run(async () => {
                          replace(await auth.request<FollowedCalendar>(`/calendars/${calendar.id}/refresh`, { method: 'POST' }));
                          return '';
                        }, 'Could not check the calendar')
                      }
                    />
                    <Button label="Stop following" onClick={() => setStopping(calendar)} />
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
      {stopping && (
        <ConfirmDialog
          busyLabel="Stopping…"
          confirmLabel="Stop following"
          errorFallback="Could not stop following the calendar"
          onClose={() => setStopping(undefined)}
          onConfirm={async () => {
            await auth.request(`/calendars/${stopping.id}`, { method: 'DELETE' });
            calendars.mutate((current) => current.filter((shown) => shown.id !== stopping.id));
          }}
          title={`Stop following ${stopping.name}?`}
          tone="danger"
        >
          Its events disappear from the Agenda for everyone in {spaces.data!.find((space) => space.id === stopping.spaceId)!.name}.
        </ConfirmDialog>
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
    <Page actions={editable.length > 0 && <Button icon="plus" label="Follow a calendar" onClick={() => setFollowing(true)} primary />} eyebrow="Agenda" title="Calendars">
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
            <Copyable value={url} />
            <Hint>Copy it now. It is shown only once.</Hint>
          </div>
        ) : feed.data.enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button disabled={action.busy} label="Make a new link" onClick={() => setResetting(true)} />
            <Button
              disabled={action.busy}
              label="Turn the link off"
              onClick={() =>
                void action.run(async () => {
                  await auth.request('/me/calendar-feed', { method: 'DELETE' });
                  feed.mutate(() => ({ enabled: false }));
                  return 'The calendar link is turned off.';
                }, 'Could not turn the link off')
              }
            />
          </div>
        ) : (
          <Button disabled={action.busy} icon="link" label="Create a calendar link" onClick={create} />
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
          tone="danger"
        >
          <Hint>The old link stops working, so calendars subscribed to it stop updating.</Hint>
        </ConfirmDialog>
      )}
    </Page>
  );
}
