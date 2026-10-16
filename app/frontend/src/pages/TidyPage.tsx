import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatDay, ListSkeleton, Tabs, timeAgo } from '@project-graphite/ui';
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
import { Page, Section } from '../components/Page';
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
  const [applied, setApplied] = useState<TidyBatch | null>();

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
    <div className="grid gap-10">
      {applied !== undefined && (
        <div className="flex flex-wrap items-center gap-3" role="status">
          <p className="m-0 text-ink">{applied ? `${batchSummary(applied)}.` : 'Nothing needed changing after all.'}</p>
          {applied && (
            <Button
              disabled={undoing.busy}
              label="Undo"
              onClick={() =>
                void undoing.run(async () => {
                  const result = await auth.request<UndoResult>(`/tidy/history/${applied.id}/undo`, { method: 'POST' });
                  setApplied(undefined);
                  scan.reload();
                  return undoSummary(result);
                }, 'Could not undo')
              }
            />
          )}
        </div>
      )}
      {empty ? (
        <Empty title="Nothing to tidy" />
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
            <div className="mt-4" key={group.items[0]?.id}>
              <p className="mono-sm m-0 text-faint">
                {group.items.length} copies of {fileSize(group.sizeBytes)}
              </p>
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
            <div className="mt-4" key={group.category}>
              <p className="mono-sm m-0 text-faint">
                {group.items.length} in {categoryLabel(group.category)}
              </p>
              <ul className="panel-rows">{group.items.map((entry) => subscriptionChoice(entry, spaceName(entry.spaceId)))}</ul>
            </div>
          ))}
        </Section>
      )}

      {selected.size > 0 && (
        <SelectionBar label={`${itemsText(selected.size)} selected`} onClear={() => setSelected(new Set())}>
          <Button label="Archive" onClick={() => open('archive')} />
          <Button label="Move to the trash" onClick={() => open('trash')} />
          {[...selected].some((id) => subscriptionIds.has(id)) && <Button label="Cancel subscriptions" onClick={() => open('cancel')} />}
        </SelectionBar>
      )}

      {request && (
        <TidyPreview
          onApplied={(batch) => {
            setRequest(undefined);
            setSelected(new Set());
            setApplied(batch);
            scan.reload();
          }}
          onClose={() => setRequest(undefined)}
          request={request}
        />
      )}
    </div>
  );
}

function TidyHistory() {
  const auth = useAuth();
  const history = useResource<TidyBatch[]>('/tidy/history', true);
  const undoing = useAction();

  if (history.error) return <LoadError error={history.error} onRetry={history.reload} />;
  if (!history.data) return <ListSkeleton label="Loading your undo history" rows={4} />;

  return (
    <div className="grid gap-4">
      {history.data.length === 0 ? (
        <Empty title="Nothing tidied yet">
          Changes stay here for 90 days, so you can undo them.
        </Empty>
      ) : (
        <ul className="panel-rows">
          {history.data.map((batch) => (
            <li className="flex items-center justify-between gap-4 panel-row" key={batch.id}>
              <div className="min-w-0">
                <p className="m-0 text-ink">{batchSummary(batch)}</p>
                <p className="mono-sm mt-1 mb-0 text-faint">
                  {timeAgo(batch.createdAt)}
                  {batch.rule && ` · by the rule “${batch.rule.titleContains || fileTypeNames[batch.rule.fileType ?? '']}”`}
                  {batch.undoneAt
                    ? ' · undone'
                    : batch.remaining < batch.itemCount && ` · ${itemsText(batch.itemCount - batch.remaining)} since deleted`}
                </p>
              </div>
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
      )}
    </div>
  );
}

export function TidyPage() {
  const [params] = useSearchParams();
  const view = params.get('view');

  return (
    <Page title="Tidy">
      <Tabs
        items={[
          { active: view !== 'history' && view !== 'folder', href: '/tidy', label: 'Suggestions' },
          { active: view === 'folder', href: '/tidy?view=folder', label: 'Folder on this computer' },
          { active: view === 'history', href: '/tidy?view=history', label: 'Undo history' },
        ]}
        label="Tidy view"
      />
      {view === 'history' ? <TidyHistory /> : view === 'folder' ? <FolderScan /> : <TidySuggestions />}
    </Page>
  );
}
