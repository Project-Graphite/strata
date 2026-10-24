import { Link, useSearchParams } from 'react-router';
import { useState } from 'react';
import { Placeholder, TextField, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { saveBookmark, siteLabel, type Bookmark } from '../bookmarks';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { FilterChips, Page } from '../components/Page';
import { RowText } from '../components/RowText';
import { RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { required, useFormErrors, webAddress } from '../validation';

const filters = [
  { value: 'unread', label: 'Read later', empty: 'Nothing to read later', hint: 'Links you save stay here until you’ve read them.' },
  { value: 'read', label: 'Read', empty: 'No read bookmarks yet', hint: 'Bookmarks you’ve opened or marked read show up here.' },
  { value: 'all', label: 'All', empty: 'No bookmarks yet', hint: 'Save links to read later, from here or by sharing them to Strata from another app.' },
] as const;

export function BookmarksPage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const [params] = useSearchParams();
  const status = filters.find((filter) => filter.value === params.get('status')) ?? filters[0];
  const listed = useResource<Bookmark[]>(`/me/bookmarks${status.value === 'all' ? '' : `?status=${status.value}`}`, true);
  const saving = useAction();
  const marking = useAction();
  const form = useFormErrors();
  const [adding, setAdding] = useState(false);
  const [rows] = useRememberedShape(`bookmarks-${status.value}`, listed.data && [listed.data.length], [4]);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const editable = (bookmark: Bookmark) => writable.some((space) => space.id === bookmark.spaceId);

  function markRead(bookmark: Bookmark, read: boolean) {
    void marking.run(async () => {
      await auth.request(`/bookmarks/${bookmark.id}`, { method: 'PATCH', body: JSON.stringify({ read }) });
      listed.reload();
      return {
        message: read ? `Marked ${bookmark.title} as read.` : `Moved ${bookmark.title} back to read later.`,
        undo: async () => {
          await auth.request(`/bookmarks/${bookmark.id}`, { method: 'PATCH', body: JSON.stringify({ read: !read }) });
          listed.reload();
          return '';
        },
      };
    }, 'Could not change the bookmark');
  }

  return (
    <Page
      actions={writable.length > 0 && <Button icon="plus" label="New bookmark" large onClick={() => setAdding(true)} primary />}
      title="Bookmarks"
      toolbar={
        <FilterChips
          items={filters.map((filter) => ({ active: status.value === filter.value, href: `/bookmarks?status=${filter.value}`, label: filter.label }))}
          label="Show"
        />
      }
    >
      {adding && (
        <FormDialog
          busy={saving.busy}
          busyLabel="Adding…"
          onClose={() => setAdding(false)}
          onSubmit={(target) => {
            if (!form.check(target, { url: [required('Enter a web address.'), webAddress] })) return;
            const values = new FormData(target);
            void saving
              .run(async () => {
                const { bookmark, fetchError } = await saveBookmark(auth.request, String(values.get('spaceId')), String(values.get('url')).trim());
                listed.reload();
                return fetchError ? `Added ${bookmark.title}, but the page couldn’t be read: ${fetchError}` : `Added ${bookmark.title}.`;
              }, 'Could not add the bookmark')
              .then((saved) => saved && setAdding(false));
          }}
          submitLabel="Add bookmark"
          title="New bookmark"
        >
          <TextField autoFocus inputMode="url" label="Link" placeholder="https://" type="url" {...form.field('url')} />
          <input name="spaceId" type="hidden" value={writable[0]!.id} />
        </FormDialog>
      )}
      {listed.error ? (
        <LoadError error={listed.error} onRetry={listed.reload} />
      ) : !listed.data ? (
        <Placeholder label="Loading your bookmarks">
          {rows ? (
            <RowsSkeleton below={<SkeletonLine className="text-sm" width="w-4/5" />} rows={rows} />
          ) : (
            <Empty loading title={status.empty}>
              {status.hint}
            </Empty>
          )}
        </Placeholder>
      ) : listed.data.length === 0 ? (
        <Empty title={status.empty}>{status.hint}</Empty>
      ) : (
        <ul className="panel-rows">
          {listed.data.map((bookmark) => (
            <li className="flex items-center gap-3 pe-2 hover:bg-line-soft" key={bookmark.id}>
              <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" to={`/bookmarks/${bookmark.id}`}>
                <RowText
                  detail={[siteLabel(bookmark), spaces.data?.find((space) => space.id === bookmark.spaceId)?.name, `saved ${timeAgo(bookmark.createdAt)}`].filter(Boolean).join(' · ')}
                  title={bookmark.title}
                >
                  {bookmark.description && <span className="line-clamp-2 text-sm text-muted">{bookmark.description}</span>}
                </RowText>
              </Link>
              {editable(bookmark) && (
                <ActionsMenu
                  items={[{ label: bookmark.readAt ? 'Move back to read later' : 'Mark read', onSelect: () => markRead(bookmark, !bookmark.readAt) }]}
                  name={bookmark.title}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
