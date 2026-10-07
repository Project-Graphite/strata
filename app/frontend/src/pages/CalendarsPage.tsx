import { useState } from 'react';
import { ConfirmDialog, ListSkeleton, PageHeader } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { LoadError } from '../components/LoadError';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

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
