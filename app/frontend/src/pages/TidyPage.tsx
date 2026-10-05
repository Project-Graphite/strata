import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton, PageHeader, Tabs, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { Choice, Suggestion } from '../components/TidyList';
import { batchSummary, itemsText, TidyPreview, undoSummary, type TidyAction, type TidyBatch, type TidyRequest } from '../components/TidyPreview';
import { fileSize, fileTypeNames } from '../files';
import { useSpaces } from '../spaces';
import { money, shortDate } from '../subscriptions';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { FolderScan } from './FolderScan';
import { LoadError } from '../components/LoadError';

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
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
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
            <button
              className="secondary-button px-3 py-2 text-sm"
              disabled={undoing.busy}
              onClick={() =>
                void undoing.run(async () => {
                  const result = await auth.request<UndoResult>(`/tidy/history/${applied.id}/undo`, { method: 'POST' });
                  setApplied(undefined);
                  scan.reload();
                  return undoSummary(result);
                }, 'Could not undo')
              }
              type="button"
            >
              Undo
            </button>
          )}
        </div>
      )}
      {empty ? (
        <EmptyState title="Nothing to tidy" />
      ) : (
        saving > 0 && (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="m-0 text-2xl text-ink">{fileSize(saving)}</p>
            <p className="mono-sm m-0 mt-1 text-faint">of your storage is taken by extra copies of the same file</p>
          </div>
        )
      )}

      {files.duplicates.length > 0 && (
        <Suggestion
          action={
            <button
              className="secondary-button px-3 py-2 text-sm"
              onClick={() => setSelected(new Set([...selected, ...files.duplicates.flatMap((group) => group.items.slice(1).map((file) => file.id))]))}
              type="button"
            >
              Select the extra copies
            </button>
          }
          hint="The same file, uploaded more than once. Keep the first copy and move the rest to the trash."
          title="Duplicate uploads"
        >
          {files.duplicates.map((group) => (
            <div className="mt-4" key={group.items[0]?.id}>
              <p className="mono-sm m-0 text-faint">
                {group.items.length} copies of {fileSize(group.sizeBytes)}
              </p>
              <ul className="m-0 grid list-none gap-0 p-0">
                {group.items.map((file) => fileChoice(file, `${spaceName(file.spaceId)} · added ${timeAgo(file.createdAt)}`))}
              </ul>
            </div>
          ))}
        </Suggestion>
      )}

      {files.large.length > 0 && (
        <Suggestion hint="Uploads of 5 MB or more, biggest first." title="Large uploads">
          <ul className="mt-3 grid list-none gap-0 p-0">
            {files.large.map((file) => fileChoice(file, `${fileSize(file.sizeBytes)} · ${spaceName(file.spaceId)}`))}
          </ul>
        </Suggestion>
      )}

      {files.old.length > 0 && (
        <Suggestion hint="Uploads nobody has changed for a year. Archiving keeps them but takes them out of the way." title="Old uploads">
          <ul className="mt-3 grid list-none gap-0 p-0">
            {files.old.map((file) => fileChoice(file, `unchanged since ${new Date(file.updatedAt).toLocaleDateString()}`))}
          </ul>
        </Suggestion>
      )}

      {subscriptions.unused.length > 0 && (
        <Suggestion hint="Nobody has marked these as used in two months." title="Unused subscriptions">
          <ul className="mt-3 grid list-none gap-0 p-0">
            {subscriptions.unused.map((entry) =>
              subscriptionChoice(entry, entry.lastUsedOn ? `last used ${shortDate(entry.lastUsedOn)}` : 'never marked as used'),
            )}
          </ul>
        </Suggestion>
      )}

      {subscriptions.duplicates.length > 0 && (
        <Suggestion hint="Subscriptions with the same name, perhaps paid twice." title="Duplicate subscriptions">
          {subscriptions.duplicates.map((group) => (
            <ul className="mt-3 grid list-none gap-0 p-0" key={group.name}>
              {group.items.map((entry) => subscriptionChoice(entry, spaceName(entry.spaceId)))}
            </ul>
          ))}
        </Suggestion>
      )}

      {subscriptions.overlapping.length > 0 && (
        <Suggestion hint="More than one subscription doing the same job." title="Overlapping subscriptions">
          {subscriptions.overlapping.map((group) => (
            <div className="mt-4" key={group.category}>
              <p className="mono-sm m-0 text-faint">
                {group.items.length} in {group.category}
              </p>
              <ul className="m-0 grid list-none gap-0 p-0">{group.items.map((entry) => subscriptionChoice(entry, spaceName(entry.spaceId)))}</ul>
            </div>
          ))}
        </Suggestion>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <span className="mono-sm text-faint">{itemsText(selected.size)} selected</span>
          <button className="secondary-button px-3 py-2 text-sm" onClick={() => open('archive')} type="button">
            Archive
          </button>
          <button className="secondary-button px-3 py-2 text-sm" onClick={() => open('trash')} type="button">
            Move to the trash
          </button>
          {[...selected].some((id) => subscriptionIds.has(id)) && (
            <button className="secondary-button px-3 py-2 text-sm" onClick={() => open('cancel')} type="button">
              Cancel subscriptions
            </button>
          )}
          <button className="secondary-button px-3 py-2 text-sm" onClick={() => setSelected(new Set())} type="button">
            Clear
          </button>
        </div>
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
        <EmptyState title="Nothing tidied yet">
          <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">
            Changes stay here for 90 days, so you can undo them.
          </p>
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {history.data.map((batch) => (
            <li className="flex items-center justify-between gap-4 border-b border-line-soft py-3" key={batch.id}>
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
                <button
                  className="secondary-button shrink-0 px-3 py-2 text-sm"
                  disabled={undoing.busy}
                  onClick={() =>
                    void undoing.run(async () => {
                      const result = await auth.request<UndoResult>(`/tidy/history/${batch.id}/undo`, { method: 'POST' });
                      history.reload();
                      return undoSummary(result);
                    }, 'Could not undo')
                  }
                  type="button"
                >
                  Undo
                </button>
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
    <section className="page-enter grid max-w-3xl gap-8">
      <PageHeader title="Tidy" />
      <Tabs
        items={[
          { active: view !== 'history' && view !== 'folder', href: '/tidy', label: 'Suggestions' },
          { active: view === 'folder', href: '/tidy?view=folder', label: 'Folder on this computer' },
          { active: view === 'history', href: '/tidy?view=history', label: 'Undo history' },
        ]}
        label="Tidy view"
      />
      {view === 'history' ? <TidyHistory /> : view === 'folder' ? <FolderScan /> : <TidySuggestions />}
    </section>
  );
}
