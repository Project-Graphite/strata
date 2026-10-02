import { Link, useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton, Pagination, timeAgo } from '@project-graphite/ui';
import type { Page } from '../api';
import { useAuth } from '../auth';
import { useInbox, type InboxNotification } from '../inbox';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

export function InboxPage() {
  const auth = useAuth();
  const inbox = useInbox();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const notifications = useResource<Page<InboxNotification>>(`/me/inbox?page=${page}`, true);
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
    <section className="page-enter grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">inbox</p>
          <h1 className="page-title">Inbox</h1>
        </div>
        {(inbox.data?.unread ?? 0) > 0 && (
          <button
            className="secondary-button px-3 py-2 text-sm"
            disabled={action.busy}
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
            type="button"
          >
            Mark all read
          </button>
        )}
      </div>
      {action.status}
      {notifications.error ? (
        <p className="error-message">{notifications.error}</p>
      ) : !notifications.data ? (
        <ListSkeleton label="Loading your inbox" rows={4} />
      ) : notifications.data.results.length === 0 ? (
        <EmptyState title="Nothing new">
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            Invitations and changes to your spaces appear here.
          </p>
        </EmptyState>
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
                <button
                  className="secondary-button shrink-0 px-3 py-2 text-sm"
                  disabled={action.busy}
                  onClick={() => setRead(notification, !notification.read)}
                  type="button"
                >
                  {notification.read ? 'Mark unread' : 'Mark read'}
                </button>
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
    </section>
  );
}
