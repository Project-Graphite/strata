import { Link, useSearchParams } from 'react-router';
import { IconButton, Pagination, Placeholder, timeAgo } from '@project-graphite/ui';
import type { Page as ResultPage } from '../api';
import { useAuth } from '../auth';
import { useInbox, type InboxNotification } from '../inbox';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Empty } from '../components/Empty';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { ActionsMenu } from '../components/ActionsMenu';
import { RowText } from '../components/RowText';
import { RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';

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
          <IconButton
            disabled={action.busy}
            icon="check-mark"
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
        <Placeholder label="Loading your inbox">
          {rows ? (
            <RowsSkeleton below={<SkeletonLine className="mono-sm" width="w-16" />} lead={<span className="size-2 shrink-0" />} rows={rows} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : notifications.data.results.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <>
          <ul className="panel-rows">
            {notifications.data.results.map((notification) => {
              const content = (
                <>
                  <span aria-hidden={notification.read} className={`mt-2 size-2 shrink-0 rounded-full ${notification.read ? '' : 'bg-ink'}`}>
                    {!notification.read && <span className="sr-only">Unread: </span>}
                  </span>
                  <RowText
                    detail={notification.body && (notification.kind === 'comment' || notification.kind === 'invitation' ? `“${notification.body}”` : notification.body)}
                    title={<span className={notification.read ? 'text-muted' : 'font-medium'}>{notification.title}</span>}
                  >
                    <span className="mono-sm text-faint">{timeAgo(notification.createdAt)}</span>
                  </RowText>
                </>
              );
              return (
                <li className={`flex items-center gap-3 pe-2 ${notification.link ? 'hover:bg-line-soft' : ''}`} key={notification.id}>
                  {notification.link ? (
                    <Link
                      className="flex min-w-0 flex-1 items-start gap-3 panel-row text-ink no-underline"
                      onClick={() => !notification.read && setRead(notification, true)}
                      to={notification.link}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-start gap-3 panel-row">{content}</div>
                  )}
                  <ActionsMenu
                    items={[{ label: notification.read ? 'Mark unread' : 'Mark read', onSelect: () => setRead(notification, !notification.read) }]}
                    name={notification.title}
                  />
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
