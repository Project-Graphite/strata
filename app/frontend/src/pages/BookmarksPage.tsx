import { useSearchParams, Link } from 'react-router';
import { useState } from 'react';
import { ListSkeleton, Select, Tabs, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { saveBookmark, siteLabel, type Bookmark } from '../bookmarks';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { HeaderButton, Page } from '../components/Page';
import { spaceOptions, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { required, useFormErrors, webAddress } from '../validation';

const filters = [
  ['unread', 'Read later'],
  ['read', 'Read'],
  ['all', 'All'],
] as const;

export function BookmarksPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const status = filters.find(([value]) => value === params.get('status'))?.[0] ?? 'unread';
  const listed = useResource<Bookmark[]>(`/me/bookmarks${status === 'all' ? '' : `?status=${status}`}`, true);
  const saving = useAction();
  const marking = useAction();
  const form = useFormErrors();
  const [adding, setAdding] = useState(false);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const editable = (bookmark: Bookmark) => writable.some((space) => space.id === bookmark.spaceId);

  function markRead(bookmark: Bookmark, read: boolean) {
    void marking.run(async () => {
      await auth.request(`/bookmarks/${bookmark.id}`, { method: 'PATCH', body: JSON.stringify({ read }) });
      listed.reload();
      return read ? 'Marked as read.' : 'Back on your read-later list.';
    }, 'Could not change the bookmark');
  }

  return (
    <Page actions={writable.length > 0 && <HeaderButton icon="plus" label="Save a link" onClick={() => setAdding(true)} primary />} title="Bookmarks">
      {adding && (
        <FormDialog
          busy={saving.busy}
          busyLabel="Saving…"
          onClose={() => setAdding(false)}
          onSubmit={(target) => {
            if (!form.check(target, { url: [required('Enter a web address.'), webAddress] })) return;
            const values = new FormData(target);
            void saving
              .run(async () => {
                const { fetchError } = await saveBookmark(auth.request, String(values.get('spaceId')), String(values.get('url')).trim());
                listed.reload();
                return fetchError ? `Saved, but the page could not be read: ${fetchError}` : 'Saved to read later.';
              }, 'Could not save the link')
              .then((saved) => saved && setAdding(false));
          }}
          submitLabel="Save"
          title="Save a link"
        >
          <TextField autoFocus inputMode="url" label="Link" placeholder="https://" type="url" {...form.field('url')} />
          {writable.length > 1 ? (
            <Select defaultValue={writable[0]!.id} label="Space" name="spaceId" options={spaceOptions(writable)} />
          ) : (
            <input name="spaceId" type="hidden" value={writable[0]!.id} />
          )}
        </FormDialog>
      )}
      <Tabs items={filters.map(([value, label]) => ({ active: status === value, href: `/bookmarks?status=${value}`, label }))} label="Bookmarks" />
      {listed.error ? (
        <LoadError error={listed.error} onRetry={listed.reload} />
      ) : !listed.data ? (
        <ListSkeleton label="Loading your bookmarks" rows={4} />
      ) : listed.data.length === 0 ? (
        <Empty title={status === 'unread' ? 'Nothing to read later' : 'No bookmarks here'} />
      ) : (
        <ul className="panel-rows">
          {listed.data.map((bookmark) => (
            <li className="panel-row flex items-start gap-3" key={bookmark.id}>
              <div className="grid min-w-0 flex-1 gap-1">
                <Link className="truncate text-ink no-underline hover:underline" to={`/bookmarks/${bookmark.id}`}>
                  {bookmark.title}
                </Link>
                {bookmark.description && <p className="m-0 line-clamp-2 text-sm text-muted">{bookmark.description}</p>}
                <span className="mono-sm text-faint">
                  <a className="text-faint" href={bookmark.url} rel="noopener noreferrer nofollow" target="_blank">
                    {siteLabel(bookmark)}
                  </a>
                  {' · '}
                  {spaces.data?.find((space) => space.id === bookmark.spaceId)?.name} · saved {timeAgo(bookmark.createdAt)}
                </span>
              </div>
              {editable(bookmark) && (
                <button className="text-button shrink-0 text-sm" disabled={marking.busy} onClick={() => markRead(bookmark, !bookmark.readAt)} type="button">
                  {bookmark.readAt ? 'Mark unread' : 'Mark read'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
