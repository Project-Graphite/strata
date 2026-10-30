import { Link, useSearchParams } from 'react-router';
import { Pagination, Placeholder } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { useInbox, type InboxNotification } from '../inbox';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { ActionsMenu } from '../components/ActionsMenu';
import { IconButtonSkeleton, RowsSkeleton, useRememberedShape } from '../components/Skeletons';

const empty = { title: 'Nothing new', hint: 'Comments, invitations and changes in your shared spaces show up here.' };

export function InboxPage() {
  const auth = useAuth();
  const inbox = useInbox();
  const [params] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const notifications = useResource<ResultPage<InboxNotification>>(`/me/inbox?page=${page}`, true);
  const action = useAction();
  const [rows] = useRememberedShape('inbox', notifications.data && [notifications.data.results.length], [4]);

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
          <ActionsMenu
            items={[
              {
                label: 'Mark all read',
                onSelect: () =>
                  void action.run(async () => {
                    await auth.request('/me/inbox/read', { method: 'POST' });
                    notifications.mutate((current) => ({
                      ...current,
                      results: current.results.map((shown) => ({ ...shown, read: true })),
                    }));
                    inbox.reload();
                    return 'Everything is marked read.';
                  }, 'Could not mark everything read'),
              },
            ]}
            name="Inbox"
          />
        )
      }
      title="Inbox"
    >
      {notifications.error ? (
        <LoadError error={notifications.error} onRetry={notifications.reload} />
      ) : !notifications.data ? (
        <Placeholder label="Loading your inbox">
          {rows ? (
            <RowsSkeleton lead={<span className="size-2 shrink-0" />} rows={rows} trail={<IconButtonSkeleton />} />
          ) : (
            <Empty icon="bell" loading title={empty.title} variant="page">
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : notifications.data.results.length === 0 ? (
        <Empty icon="bell" title={empty.title} variant="page">
          {empty.hint}
        </Empty>
      ) : (
        <>
          <ul className="panel-rows">
            {notifications.data.results.map((notification) => {
              const content = (
                <>
                  <span className="list-row-lead">
                    <span aria-hidden={notification.read} className={notification.read ? 'size-2' : 'unread-dot'}>
                      {!notification.read && <span className="sr-only">Unread: </span>}
                    </span>
                  </span>
                  <span className="list-row-text">
                    <span className="list-row-title">
                      <span className={notification.read ? 'text-muted' : undefined}>{notification.title}</span>
                    </span>
                    <span className="list-row-meta tabular-nums">
                      {[
                        formatMoment(notification.createdAt),
                        notification.body && (notification.kind === 'comment' || notification.kind === 'invitation' ? `“${notification.body}”` : notification.body),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </>
              );
              return (
                <li className="list-row" key={notification.id}>
                  {notification.link ? (
                    <Link className="list-row-main" onClick={() => !notification.read && setRead(notification, true)} to={notification.link}>
                      {content}
                    </Link>
                  ) : (
                    <div className="list-row-main">{content}</div>
                  )}
                  <span className="list-row-trail">
                    <ActionsMenu
                      items={[{ label: notification.read ? 'Mark unread' : 'Mark read', onSelect: () => setRead(notification, !notification.read) }]}
                      name={notification.title}
                    />
                  </span>
                </li>
              );
            })}
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
