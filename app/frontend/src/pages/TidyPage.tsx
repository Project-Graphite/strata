import { useState } from 'react';
import { formatDay, ListSkeleton, timeAgo } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { useAuth } from '../auth';
import { Empty } from '../components/Empty';
import { Stat, Stats } from '../components/Stats';
import { Choice, SelectionBar, toggled } from '../components/Selection';
import { batchSummary, itemsText, TidyPreview, undoSummary, type TidyAction, type TidyBatch, type TidyRequest } from '../components/TidyPreview';
import { fileSize, fileTypeNames } from '../files';
import { useSpaces } from '../spaces';
import { categoryLabel, money, shortDate } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { FolderScan } from './FolderScan';
import { LoadError } from '../components/LoadError';
import { Page, Section, Subheading } from '../components/Page';
import { RowText } from '../components/RowText';
import { Button } from '../components/Button';

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

  if (scan.error) return <LoadError error={scan.error} onRetry={scan.reload} />;
  if (!scan.data) return <ListSkeleton label="Looking for clutter" rows={5} />;
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
        <Empty title="Nothing to tidy">There are no duplicate, large or old uploads, and no subscriptions that look unused.</Empty>
      ) : (
        saving > 0 && (
          <Stats>
            <Stat detail="of your storage is taken by extra copies of the same file" label="Extra copies" value={fileSize(saving)} />
          </Stats>
        )
      )}

      {files.duplicates.length > 0 && (
        <Section
          action={
            <Button label="Select the extra copies" onClick={() => setSelected(new Set([...selected, ...files.duplicates.flatMap((group) => group.items.slice(1).map((file) => file.id))]))} />
          }
          description="The same file, uploaded more than once. Keep the first copy and move the rest to the trash."
          title="Duplicate uploads"
        >
          {files.duplicates.map((group) => (
            <div className="grid gap-2" key={group.items[0]?.id}>
              <Subheading>
                {group.items.length} copies of {fileSize(group.sizeBytes)}
              </Subheading>
              <ul className="panel-rows">
                {group.items.map((file) => fileChoice(file, `${spaceName(file.spaceId)} · added ${timeAgo(file.createdAt)}`))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {files.large.length > 0 && (
        <Section description="Uploads of 5 MB or more, biggest first." title="Large uploads">
          <ul className="panel-rows">
            {files.large.map((file) => fileChoice(file, `${fileSize(file.sizeBytes)} · ${spaceName(file.spaceId)}`))}
          </ul>
        </Section>
      )}

      {files.old.length > 0 && (
        <Section description="Uploads nobody has changed for a year. Archiving keeps them but takes them out of the way." title="Old uploads">
          <ul className="panel-rows">
            {files.old.map((file) => fileChoice(file, `unchanged since ${formatDay(dayKey(new Date(file.updatedAt)), { day: 'numeric', month: 'short', year: 'numeric' })}`))}
          </ul>
        </Section>
      )}

      {subscriptions.unused.length > 0 && (
        <Section description="Nobody has marked these as used in two months." title="Unused subscriptions">
          <ul className="panel-rows">
            {subscriptions.unused.map((entry) =>
              subscriptionChoice(entry, entry.lastUsedOn ? `last used ${shortDate(entry.lastUsedOn)}` : 'never marked as used'),
            )}
          </ul>
        </Section>
      )}

      {subscriptions.duplicates.length > 0 && (
        <Section description="Subscriptions with the same name, perhaps paid twice." title="Duplicate subscriptions">
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
            <div className="grid gap-2" key={group.category}>
              <Subheading>
                {group.items.length} in {categoryLabel(group.category)}
              </Subheading>
              <ul className="panel-rows">{group.items.map((entry) => subscriptionChoice(entry, spaceName(entry.spaceId)))}</ul>
            </div>
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

  if (history.error) return <LoadError error={history.error} onRetry={history.reload} />;
  if (!history.data) return <ListSkeleton label="Loading your undo history" rows={4} />;

  return history.data.length === 0 ? (
    <Empty title="Nothing tidied yet">Changes stay here for 90 days, so you can undo them.</Empty>
  ) : (
    <ul className="panel-rows">
      {history.data.map((batch) => (
        <li className="panel-row flex items-center gap-3" key={batch.id}>
          <RowText
            detail={[
              timeAgo(batch.createdAt),
              batch.rule && `by the rule “${batch.rule.titleContains || fileTypeNames[batch.rule.fileType ?? '']}”`,
              batch.undoneAt ? 'undone' : batch.remaining < batch.itemCount && `${itemsText(batch.itemCount - batch.remaining)} since deleted`,
            ]
              .filter(Boolean)
              .join(' · ')}
            title={batchSummary(batch)}
          />
          {!batch.undoneAt && batch.remaining > 0 && (
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
          )}
        </li>
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
      title="Tidy"
    >
      {section === 'history' ? <TidyHistory /> : section === 'folder' ? <FolderScan /> : <TidySuggestions />}
    </Page>
  );
}
