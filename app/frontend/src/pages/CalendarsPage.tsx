import { useState } from 'react';
import { ConfirmDialog, Placeholder, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { Copyable } from '../components/Copyable';
import { FormDialog } from '../components/FormDialog';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { useSpaces } from '../spaces';
import { required, useFormErrors } from '../validation';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { RowText } from '../components/RowText';
import { ButtonSkeleton, HintSkeleton, IconButtonSkeleton, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';

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
          <RowsSkeleton below={<SkeletonLine className="text-sm" width="w-3/5" />} belowRows={failedRows} rows={rows} trail={editable.length > 0 && <IconButtonSkeleton />} />
        ) : (
          <HintSkeleton />
        )}
      </Placeholder>
    );
  }
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
                return `Followed ${added.name}.`;
              }, 'Could not follow that calendar')
              .then((done) => done && onClose());
          }}
          submitLabel="Follow"
          title="Follow a calendar"
        >
          <TextField autoFocus hint="An https:// or webcal:// address." inputMode="url" label="Calendar address" {...form.field('url')} />
          <TextField label="Name (optional)" maxLength={80} {...form.field('name')} />
          <input name="spaceId" type="hidden" value={editable[0]?.id ?? ''} />
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
  const [turningOff, setTurningOff] = useState(false);
  const [feedEnabled] = useRememberedShape('calendar-feed', feed.data && [Number(feed.data.enabled)], [0]);

  return (
    <Page
      actions={editable.length > 0 && <Button icon="plus" label="Follow a calendar" onClick={() => setFollowing(true)} primary />}
      back={{ to: '/agenda', label: 'Agenda' }}
      title="Calendars"
    >
      <Section
        description="Subscribe to this link in Google Calendar, Apple Calendar or Outlook to see the events of all your spaces there. Anyone with the link can see them, so keep it private."
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
      <Section
        description="Follow a public calendar, such as holidays, fixtures or a shared Google calendar’s secret address. Its events appear in the Agenda for everyone in the space, read-only. They are checked again whenever you open the Agenda, and every 15 minutes otherwise."
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
