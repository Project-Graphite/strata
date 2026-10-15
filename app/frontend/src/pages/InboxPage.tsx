import { Link, useSearchParams } from 'react-router';
import { ListSkeleton, Pagination, timeAgo } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { useInbox, type InboxNotification } from '../inbox';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { Button } from '../components/Button';

export function InboxPage() {
  const auth = useAuth();
  const inbox = useInbox();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const notifications = useResource<ResultPage<InboxNotification>>(`/me/inbox?page=${page}`, true);
  const action = useAction();

  function setRead(notification: InboxNotification, read: boolean) {
    void action.run(async () => {
      await auth.request(`/me/inbox/${notification.id}`, { method: 'PATCH', body: JSON.stringify({ read }) });
      notifications.mutate((current) => ({
        ...current,
        results: current.results.map((shown) => (shown.id === notification.id ? { ...shown, read } : shown)),
      }));
      inbox.reload();
      return '';
    }, 'Could not update that notification');
  }

  return (
    <Page
      actions={
        (inbox.data?.unread ?? 0) > 0 && (
          <Button
            disabled={action.busy}
            label="Mark all read"
            onClick={() =>
              void action.run(async () => {
                await auth.request('/me/inbox/read', { method: 'POST' });
                notifications.mutate((current) => ({
                  ...current,
                  results: current.results.map((shown) => ({ ...shown, read: true })),
                }));
                inbox.reload();
                return 'Everything is marked read.';
              }, 'Could not mark everything read')
            }
          />
        )
      }
      title="Inbox"
    >
      {notifications.error ? (
        <LoadError error={notifications.error} onRetry={notifications.reload} />
      ) : !notifications.data ? (
        <ListSkeleton label="Loading your inbox" rows={4} />
      ) : notifications.data.results.length === 0 ? (
        <Empty title="Nothing new" />
      ) : (
        <>
          <ul className="m-0 grid list-none gap-0 p-0">
            {notifications.data.results.map((notification) => (
              <li className="flex items-start justify-between gap-4 border-b border-line-soft py-4" key={notification.id}>
                <div className="min-w-0">
                  <p className={`m-0 ${notification.read ? 'text-muted' : 'font-medium text-ink'}`}>
                    {notification.link ? (
                      <Link
                        className="text-inherit no-underline hover:underline"
                        onClick={() => !notification.read && setRead(notification, true)}
                        to={notification.link}
                      >
                        {notification.title}
                      </Link>
                    ) : (
                      notification.title
                    )}
                  </p>
                  {notification.body && <p className="mt-1 mb-0 text-sm text-muted">“{notification.body}”</p>}
                  <p className="mono-sm m-0 mt-1 text-faint">{timeAgo(notification.createdAt)}</p>
                </div>
                <Button disabled={action.busy} label={notification.read ? 'Mark unread' : 'Mark read'} onClick={() => setRead(notification, !notification.read)} />
              </li>
            ))}
          </ul>
          <Pagination
            page={notifications.data.page}
            pageHref={(next) => `/inbox?page=${next}`}
            totalPages={notifications.data.totalPages}
          />
        </>
      )}
    </Page>
  );
}
