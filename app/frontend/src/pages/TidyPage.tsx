import { useState } from 'react';
import { ListRow, Placeholder, Skeleton, Stat, StatGrid } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { useAuth } from '../auth';
import { Empty } from '../components/Empty';
import { Choice, SelectionBar, toggled } from '../components/Selection';
import { batchSummary, itemsText, TidyPreview, undoSummary, type TidyAction, type TidyBatch, type TidyRequest } from '../components/TidyPreview';
import { fileSize, fileTypeNames } from '../files';
import { useAllSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource, type Resource } from '../useResource';
import { FolderScan } from './FolderScan';
import { LoadError } from '../components/LoadError';
import { NotificationsLink } from '../components/NotificationsLink';
import { Page, Section } from '../components/Page';
import { Button } from '../components/Button';
import { ButtonSkeleton, RowsSkeleton, SkeletonLine, StatsSkeleton, useRememberedShape } from '../components/Skeletons';
import { capitalised, clockTime, formatDate, formatMoment } from '../time';

const emptySuggestions = { title: 'Nothing to tidy', hint: 'There are no duplicate, large or old uploads in your spaces.' };
const emptyYours = { title: 'Nothing to tidy', hint: 'No bookmarks left unread for a year, goals past their end date or recipes you never planned.' };
const emptyHistory = { title: 'Nothing tidied yet', hint: 'Changes stay here for 90 days, so you can undo them.' };
const duplicateUploads = { title: 'Duplicate uploads', description: 'The same file, uploaded more than once. Keep the first copy and move the rest to the trash.' };
const largeUploads = { title: 'Large uploads', description: 'Uploads of 5 MB or more, biggest first.' };
const oldUploads = { title: 'Old uploads', description: 'Uploads nobody has changed for a year. Archiving keeps them but takes them out of the way.' };
const unreadBookmarks = { title: 'Unread bookmarks', description: 'Saved a year ago or more and never read.' };
const endedGoals = { title: 'Goals past their end', description: 'Still active after the period they were set for.' };
const unplannedRecipes = { title: 'Recipes never planned', description: 'Added three months ago or more and never put on a meal plan.' };
const choiceLead = (
  <span className="grid size-9.5 shrink-0 place-items-center">
    <Skeleton className="size-4 rounded-mark" />
  </span>
);

interface FileEntry {
  id: string;
  spaceId: string;
  title: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface AccountEntry {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Scan {
  files: { duplicates: { sizeBytes: number; savingBytes: number; items: FileEntry[] }[]; large: FileEntry[]; old: FileEntry[] };
  account: { bookmarks: AccountEntry[]; goals: AccountEntry[]; recipes: AccountEntry[] };
}

interface UndoResult {
  restored: number;
  skipped: { id: string; title: string | null; reason: string }[];
}

function useTidySelection(scan: Resource<Scan>) {
  const auth = useAuth();
  const undoing = useAction();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [request, setRequest] = useState<TidyRequest>();
  const toggle = (id: string) => setSelected((current) => toggled(current, id));
  const open = (action: TidyAction) => setRequest({ action, itemIds: [...selected] });
  const bar = selected.size > 0 && (
    <SelectionBar label={`${itemsText(selected.size)} selected`} onClear={() => setSelected(new Set())}>
      <Button label="Archive" onClick={() => open('archive')} />
      <Button label="Move to trash" onClick={() => open('trash')} />
    </SelectionBar>
  );
  const preview = request && (
    <TidyPreview
      onApplied={(batch) => {
        setRequest(undefined);
        setSelected(new Set());
        scan.reload();
        undoing.report(
          batch
            ? {
                message: `${batchSummary(batch)}.`,
                undo: async () => {
                  const result = await auth.request<UndoResult>(`/tidy/history/${batch.id}/undo`, { method: 'POST' });
                  scan.reload();
                  return undoSummary(result);
                },
              }
            : 'Nothing needed changing after all.',
        );
      }}
      onClose={() => setRequest(undefined)}
      request={request}
    />
  );
  return { selected, setSelected, toggle, bar, preview };
}

function TidySuggestions() {
  const spaces = useAllSpaces();
  const scan = useResource<Scan>('/tidy/scan', true);
  const { selected, setSelected, toggle, bar, preview } = useTidySelection(scan);
  const found = scan.data;
  const [extraCopies, largeRows, oldRows] = useRememberedShape(
    'tidy-suggestions',
    found && [found.files.duplicates.some((group) => group.savingBytes > 0) ? 1 : 0, found.files.large.length, found.files.old.length],
    [0, 2, 2],
  );
  const copyGroups = useRememberedShape('tidy-duplicate-files', found?.files.duplicates.map((group) => group.items.length), []);

  if (scan.error) return <LoadError error={scan.error} onRetry={scan.reload} />;
  if (!scan.data) {
    return (
      <Placeholder className="grid gap-8" label="Looking for clutter">
        {extraCopies > 0 && <StatsSkeleton />}
        {copyGroups.length > 0 && (
          <Section action={<ButtonSkeleton width="w-44" />} {...duplicateUploads}>
            {copyGroups.map((rows, group) => (
              <div className="grid gap-3" key={group}>
                <SkeletonLine className="text-h3" width="w-32" />
                <RowsSkeleton lead={choiceLead} rows={rows} />
              </div>
            ))}
          </Section>
        )}
        {(
          [
            [largeRows, largeUploads],
            [oldRows, oldUploads],
          ] as const
        ).map(
          ([rows, section]) =>
            rows > 0 && (
              <Section {...section} key={section.title}>
                <RowsSkeleton lead={choiceLead} rows={rows} />
              </Section>
            ),
        )}
        {!largeRows && !oldRows && !copyGroups.length && (
          <Empty loading title={emptySuggestions.title}>
            {emptySuggestions.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }
  const { files } = scan.data;
  const spaceName = (id: string) => spaces.data?.find((space) => space.id === id)?.name ?? 'a space';
  const saving = files.duplicates.reduce((total, group) => total + group.savingBytes, 0);
  const empty = files.duplicates.length + files.large.length + files.old.length === 0;
  const fileChoice = (file: FileEntry, detail: string) => (
    <Choice checked={selected.has(file.id)} detail={detail} key={file.id} label={file.title} onToggle={() => toggle(file.id)} />
  );

  return (
    <>
      {empty ? (
        <Empty title={emptySuggestions.title}>{emptySuggestions.hint}</Empty>
      ) : (
        saving > 0 && (
          <StatGrid>
            <Stat detail="of your storage is taken by extra copies of the same file" label="Extra copies" value={fileSize(saving)} />
          </StatGrid>
        )
      )}

      {files.duplicates.length > 0 && (
        <Section
          action={
            <Button label="Select the extra copies" onClick={() => setSelected(new Set([...selected, ...files.duplicates.flatMap((group) => group.items.slice(1).map((file) => file.id))]))} />
          }
          {...duplicateUploads}
        >
          {files.duplicates.map((group) => (
            <Section key={group.items[0]?.id} level={3} title={`${group.items.length} copies of ${fileSize(group.sizeBytes)}`}>
              <ul className="panel-rows">
                {group.items.map((file) => fileChoice(file, `${spaceName(file.spaceId)} · added ${formatMoment(file.createdAt)}`))}
              </ul>
            </Section>
          ))}
        </Section>
      )}

      {files.large.length > 0 && (
        <Section {...largeUploads}>
          <ul className="panel-rows">
            {files.large.map((file) => fileChoice(file, `${fileSize(file.sizeBytes)} · ${spaceName(file.spaceId)}`))}
          </ul>
        </Section>
      )}

      {files.old.length > 0 && (
        <Section {...oldUploads}>
          <ul className="panel-rows">
            {files.old.map((file) => fileChoice(file, `Unchanged since ${formatDate(dayKey(new Date(file.updatedAt)))}`))}
          </ul>
        </Section>
      )}

      {bar}
      {preview}
    </>
  );
}

function TidyYours() {
  const scan = useResource<Scan>('/tidy/scan', true);
  const { selected, toggle, bar, preview } = useTidySelection(scan);
  const found = scan.data;
  const rows = useRememberedShape('tidy-yours', found && [found.account.bookmarks.length, found.account.goals.length, found.account.recipes.length], [2, 1, 1]);

  if (scan.error) return <LoadError error={scan.error} onRetry={scan.reload} />;
  if (!scan.data) {
    return (
      <Placeholder className="grid gap-8" label="Looking for clutter of your own">
        {(
          [
            [rows[0], unreadBookmarks],
            [rows[1], endedGoals],
            [rows[2], unplannedRecipes],
          ] as const
        ).map(
          ([count, section]) =>
            count > 0 && (
              <Section {...section} key={section.title}>
                <RowsSkeleton lead={choiceLead} rows={count} />
              </Section>
            ),
        )}
        {rows.every((count) => !count) && (
          <Empty loading title={emptyYours.title}>
            {emptyYours.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }
  const { account } = scan.data;
  const lists = [
    [account.bookmarks, unreadBookmarks, (entry: AccountEntry) => `saved ${formatMoment(entry.createdAt)}`],
    [account.goals, endedGoals, (entry: AccountEntry) => `last changed ${formatMoment(entry.updatedAt)}`],
    [account.recipes, unplannedRecipes, (entry: AccountEntry) => `added ${formatMoment(entry.createdAt)}`],
  ] as const;

  return (
    <>
      {lists.every(([entries]) => entries.length === 0) && <Empty title={emptyYours.title}>{emptyYours.hint}</Empty>}
      {lists.map(
        ([entries, section, detail]) =>
          entries.length > 0 && (
            <Section {...section} key={section.title}>
              <ul className="panel-rows">
                {entries.map((entry) => (
                  <Choice checked={selected.has(entry.id)} detail={capitalised(detail(entry))} key={entry.id} label={entry.title || 'Untitled'} onToggle={() => toggle(entry.id)} />
                ))}
              </ul>
            </Section>
          ),
      )}
      {bar}
      {preview}
    </>
  );
}

function TidyHistory() {
  const auth = useAuth();
  const history = useResource<TidyBatch[]>('/tidy/history', true);
  const undoing = useAction();
  const [batchRows] = useRememberedShape('tidy-history', history.data && [history.data.length], [4]);

  if (history.error) return <LoadError error={history.error} onRetry={history.reload} />;
  if (!history.data) {
    return (
      <Placeholder label="Loading your undo history">
        {batchRows ? (
          <RowsSkeleton rows={batchRows} />
        ) : (
          <Empty loading title={emptyHistory.title}>
            {emptyHistory.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }

  return history.data.length === 0 ? (
    <Empty title={emptyHistory.title}>{emptyHistory.hint}</Empty>
  ) : (
    <ul className="panel-rows">
      {history.data.map((batch) => (
        <ListRow
          key={batch.id}
          meta={capitalised(
            [
              formatMoment(batch.createdAt),
              batch.rule && `by the rule “${batch.rule.titleContains || fileTypeNames[batch.rule.fileType ?? '']}”`,
              batch.undoneAt ? 'undone' : batch.remaining < batch.itemCount && `${itemsText(batch.itemCount - batch.remaining)} since deleted`,
            ]
              .filter(Boolean)
              .join(' · '),
          )}
          title={batchSummary(batch)}
          trail={
            !batch.undoneAt &&
            batch.remaining > 0 && (
              <Button
                disabled={undoing.busy}
                label="Undo"
                onClick={() =>
                  void undoing.run(async () => {
                    const result = await auth.request<UndoResult>(`/tidy/history/${batch.id}/undo`, { method: 'POST' });
                    history.reload();
                    return undoSummary(result);
                  }, 'Could not undo')
                }
              />
            )
          }
        />
      ))}
    </ul>
  );
}

export function TidyPage({ section }: { section: 'suggestions' | 'yours' | 'folder' | 'history' }) {
  return (
    <Page
      tabs={[
        { active: section === 'suggestions', href: '/tidy', label: 'In spaces' },
        { active: section === 'yours', href: '/tidy/yours', label: 'Yours' },
        { active: section === 'folder', href: '/tidy/folder', label: 'This computer' },
        { active: section === 'history', href: '/tidy/history', label: 'History' },
      ]}
      description={
        section === 'folder' &&
        'Strata looks through a folder on this computer for duplicate, large and old files. Nothing is uploaded, and the results are gone when you leave this page.'
      }
      title="Tidy"
    >
      {section === 'history' ? <TidyHistory /> : section === 'folder' ? <FolderScan /> : section === 'yours' ? <TidyYours /> : <TidySuggestions />}
      {section === 'suggestions' && (
        <NotificationsLink>{`A weekly Tidy summary on Mondays at ${clockTime('09:00')}, only when Tidy finds something.`}</NotificationsLink>
      )}
    </Page>
  );
}
