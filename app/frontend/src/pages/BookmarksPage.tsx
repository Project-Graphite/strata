import { useSearchParams } from 'react-router';
import { useState } from 'react';
import { ListRow, Placeholder, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { saveBookmark, siteLabel, type Bookmark } from '../bookmarks';
import { ActionsMenu } from '../components/ActionsMenu';
import { AddButton, Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { FilterChips, Page } from '../components/Page';
import { RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';
import { formatMoment } from '../time';
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
  const [params] = useSearchParams();
  const status = filters.find((filter) => filter.value === params.get('status')) ?? filters[0];
  const listed = useResource<Bookmark[]>(`/me/bookmarks${status.value === 'all' ? '' : `?status=${status.value}`}`, true);
  const saving = useAction();
  const marking = useAction();
  const form = useFormErrors();
  const [adding, setAdding] = useState(false);
  const [rows] = useRememberedShape(`bookmarks-${status.value}`, listed.data && [listed.data.length], [4]);
  const firstRun =
    status.value === 'read' ? undefined : ({ action: <Button icon="plus" label="New bookmark" onClick={() => setAdding(true)} primary />, icon: 'bookmark', variant: 'page' } as const);

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
      actions={<AddButton label="New bookmark" large onClick={() => setAdding(true)} primary />}
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
                const { bookmark, fetchError } = await saveBookmark(auth.request, String(values.get('url')).trim());
                listed.reload();
                return fetchError ? `Added ${bookmark.title}, but the page couldn’t be read: ${fetchError}` : `Added ${bookmark.title}.`;
              }, 'Could not add the bookmark')
              .then((saved) => saved && setAdding(false));
          }}
          submitLabel="Add bookmark"
          title="New bookmark"
        >
          <TextField autoFocus inputMode="url" label="Link" type="url" {...form.field('url')} />
        </FormDialog>
      )}
      {listed.error ? (
        <LoadError error={listed.error} onRetry={listed.reload} />
      ) : !listed.data ? (
        <Placeholder label="Loading your bookmarks">
          {rows ? (
            <RowsSkeleton below={<SkeletonLine className="text-small" width="w-4/5" />} rows={rows} />
          ) : (
            <Empty loading title={status.empty} {...firstRun}>
              {status.hint}
            </Empty>
          )}
        </Placeholder>
      ) : listed.data.length === 0 ? (
        <Empty title={status.empty} {...firstRun}>
          {status.hint}
        </Empty>
      ) : (
        <ul className="panel-rows">
          {listed.data.map((bookmark) => (
            <ListRow
              href={`/bookmarks/${bookmark.id}`}
              key={bookmark.id}
              meta={[siteLabel(bookmark), `saved ${formatMoment(bookmark.createdAt)}`].filter(Boolean).join(' · ')}
              title={bookmark.title}
              trail={
                <ActionsMenu
                  items={[{ label: bookmark.readAt ? 'Move back to read later' : 'Mark read', onSelect: () => markRead(bookmark, !bookmark.readAt) }]}
                  name={bookmark.title}
                />
              }
            >
              {bookmark.description && <span className="line-clamp-2 text-small text-muted">{bookmark.description}</span>}
            </ListRow>
          ))}
        </ul>
      )}
    </Page>
  );
}
