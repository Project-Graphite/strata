import { useState } from 'react';
import { ListRow, Placeholder, Skeleton, Stat, StatGrid } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { useAuth } from '../auth';
import { Empty } from '../components/Empty';
import { Choice, SelectionBar, toggled } from '../components/Selection';
import { batchSummary, itemsText, TidyPreview, undoSummary, type TidyAction, type TidyBatch, type TidyRequest } from '../components/TidyPreview';
import { fileSize, fileTypeNames } from '../files';
import { useSpaces } from '../spaces';
import { categoryLabel, money, shortDate } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { FolderScan } from './FolderScan';
import { LoadError } from '../components/LoadError';
import { NotificationToggle } from '../components/NotificationToggle';
import { Page, Section } from '../components/Page';
import { Button } from '../components/Button';
import { ButtonSkeleton, RowsSkeleton, SkeletonLine, StatsSkeleton, useRememberedShape } from '../components/Skeletons';
import { capitalised, clockTime, formatDate, formatMoment } from '../time';

const emptySuggestions = { title: 'Nothing to tidy', hint: 'There are no duplicate, large or old uploads, and no subscriptions that look unused.' };
const emptyHistory = { title: 'Nothing tidied yet', hint: 'Changes stay here for 90 days, so you can undo them.' };
const duplicateUploads = { title: 'Duplicate uploads', description: 'The same file, uploaded more than once. Keep the first copy and move the rest to the trash.' };
const largeUploads = { title: 'Large uploads', description: 'Uploads of 5 MB or more, biggest first.' };
const oldUploads = { title: 'Old uploads', description: 'Uploads nobody has changed for a year. Archiving keeps them but takes them out of the way.' };
const unusedSubscriptions = { title: 'Unused subscriptions', description: 'Nobody has marked these as used in two months.' };
const duplicateSubscriptions = { title: 'Duplicate subscriptions', description: 'Subscriptions with the same name, perhaps paid twice.' };
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

interface SubscriptionEntry {
  id: string;
  spaceId: string;
  name: string;
  category: string;
  currency: string;
  yearlyMinor: number;
  lastUsedOn: string | null;
}

interface Scan {
  files: { duplicates: { sizeBytes: number; savingBytes: number; items: FileEntry[] }[]; large: FileEntry[]; old: FileEntry[] };
  subscriptions: {
    unused: SubscriptionEntry[];
    duplicates: { name: string; items: SubscriptionEntry[] }[];
    overlapping: { category: string; items: SubscriptionEntry[] }[];
  };
}

interface UndoResult {
  restored: number;
  skipped: { id: string; title: string | null; reason: string }[];
}

function TidySuggestions() {
  const auth = useAuth();
  const spaces = useSpaces();
  const scan = useResource<Scan>('/tidy/scan', true);
  const undoing = useAction();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [request, setRequest] = useState<TidyRequest>();
  const found = scan.data;
  const [extraCopies, largeRows, oldRows, unusedRows] = useRememberedShape(
    'tidy-suggestions',
    found && [
      found.files.duplicates.some((group) => group.savingBytes > 0) ? 1 : 0,
      found.files.large.length,
      found.files.old.length,
      found.subscriptions.unused.length,
    ],
    [0, 2, 2, 0],
  );
  const copyGroups = useRememberedShape('tidy-duplicate-files', found?.files.duplicates.map((group) => group.items.length), []);
  const twinGroups = useRememberedShape('tidy-duplicate-subscriptions', found?.subscriptions.duplicates.map((group) => group.items.length), []);
  const overlapGroups = useRememberedShape('tidy-overlapping-subscriptions', found?.subscriptions.overlapping.map((group) => group.items.length), []);

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
            [unusedRows, unusedSubscriptions],
          ] as const
        ).map(
          ([rows, section]) =>
            rows > 0 && (
              <Section {...section} key={section.title}>
                <RowsSkeleton lead={choiceLead} rows={rows} />
              </Section>
            ),
        )}
        {twinGroups.length > 0 && (
          <Section {...duplicateSubscriptions}>
            {twinGroups.map((rows, group) => (
              <RowsSkeleton key={group} lead={choiceLead} rows={rows} />
            ))}
          </Section>
        )}
        {overlapGroups.length > 0 && (
          <Section title="Overlapping subscriptions">
            {overlapGroups.map((rows, group) => (
              <div className="grid gap-3" key={group}>
                <SkeletonLine className="text-h3" width="w-32" />
                <RowsSkeleton lead={choiceLead} rows={rows} />
              </div>
            ))}
          </Section>
        )}
        {!largeRows && !oldRows && !unusedRows && !copyGroups.length && !twinGroups.length && !overlapGroups.length && (
          <Empty loading title={emptySuggestions.title}>
            {emptySuggestions.hint}
          </Empty>
        )}
      </Placeholder>
    );
  }
  const { files, subscriptions } = scan.data;
  const spaceName = (id: string) => spaces.data?.find((space) => space.id === id)?.name ?? 'a space';
  const toggle = (id: string) => setSelected((current) => toggled(current, id));
  const subscriptionIds = new Set(
    [...subscriptions.unused, ...subscriptions.duplicates.flatMap((group) => group.items), ...subscriptions.overlapping.flatMap((group) => group.items)].map(
      (entry) => entry.id,
    ),
  );
  const saving = files.duplicates.reduce((total, group) => total + group.savingBytes, 0);
  const empty =
    files.duplicates.length + files.large.length + files.old.length + subscriptionIds.size === 0;
  const open = (action: TidyAction) => setRequest({ action, itemIds: [...selected] });
  const fileChoice = (file: FileEntry, detail: string) => (
    <Choice checked={selected.has(file.id)} detail={detail} key={file.id} label={file.title} onToggle={() => toggle(file.id)} />
  );
  const subscriptionChoice = (entry: SubscriptionEntry, detail: string) => (
    <Choice
      checked={selected.has(entry.id)}
      detail={`${money(entry.yearlyMinor, entry.currency)} a year · ${detail}`}
      key={entry.id}
      label={entry.name}
      onToggle={() => toggle(entry.id)}
    />
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

      {subscriptions.unused.length > 0 && (
        <Section {...unusedSubscriptions}>
          <ul className="panel-rows">
            {subscriptions.unused.map((entry) =>
              subscriptionChoice(entry, entry.lastUsedOn ? `last used ${shortDate(entry.lastUsedOn)}` : 'never marked as used'),
            )}
          </ul>
        </Section>
      )}

      {subscriptions.duplicates.length > 0 && (
        <Section {...duplicateSubscriptions}>
          {subscriptions.duplicates.map((group) => (
            <ul className="panel-rows" key={group.name}>
              {group.items.map((entry) => subscriptionChoice(entry, spaceName(entry.spaceId)))}
            </ul>
          ))}
        </Section>
      )}

      {subscriptions.overlapping.length > 0 && (
        <Section title="Overlapping subscriptions">
          {subscriptions.overlapping.map((group) => (
            <Section key={group.category} level={3} title={`${group.items.length} in ${categoryLabel(group.category)}`}>
              <ul className="panel-rows">{group.items.map((entry) => subscriptionChoice(entry, spaceName(entry.spaceId)))}</ul>
            </Section>
          ))}
        </Section>
      )}

      {selected.size > 0 && (
        <SelectionBar label={`${itemsText(selected.size)} selected`} onClear={() => setSelected(new Set())}>
          <Button label="Archive" onClick={() => open('archive')} />
          <Button label="Move to trash" onClick={() => open('trash')} />
          {[...selected].some((id) => subscriptionIds.has(id)) && <Button label="Cancel subscriptions" onClick={() => open('cancel')} />}
        </SelectionBar>
      )}

      {request && (
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
      )}
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

export function TidyPage({ section }: { section: 'suggestions' | 'folder' | 'history' }) {
  return (
    <Page
      tabs={[
        { active: section === 'suggestions', href: '/tidy', label: 'Suggestions' },
        { active: section === 'folder', href: '/tidy/folder', label: 'This computer' },
        { active: section === 'history', href: '/tidy/history', label: 'History' },
      ]}
      description={
        section === 'folder' &&
        'Strata looks through a folder on this computer for duplicate, large and old files. Nothing is uploaded, and the results are gone when you leave this page.'
      }
      title="Tidy"
    >
      {section === 'history' ? <TidyHistory /> : section === 'folder' ? <FolderScan /> : <TidySuggestions />}
      {section === 'suggestions' && (
        <NotificationToggle
          description={`Mondays at ${clockTime('09:00')}, only when Tidy finds something.`}
          field="tidySummary"
          label="Weekly Tidy summary"
          offMessage="Weekly Tidy summaries are off."
          onMessage="You will get a Tidy summary on Mondays."
        />
      )}
    </Page>
  );
}
