import { useState } from 'react';
import { Link } from 'react-router';
import { Card, Meter, Placeholder, Skeleton } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { fileSize, filesTabs, maxUploadBytes, saveBlob, type FilesTab } from '../files';
import { Empty } from '../components/Empty';
import { FileBrowser, sortGroups, type BrowserSort } from '../components/FileBrowser';
import { FilterMenu } from '../components/FilterMenu';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { itemHref, SpaceMark, useAllSpaces, type Space } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { HintSkeleton, IconButtonSkeleton, IconSkeleton, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';

interface StoredFile {
  id: string;
  spaceId: string | null;
  spaceName: string | null;
  attachedTo: { id: string; kind: string; title: string } | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Home {
  spaceId: string | null;
  spaceName: string | null;
  count: number;
  sizeBytes: number;
}

interface Storage {
  quotaBytes: number;
  usedBytes: number;
  trashedBytes: number;
  elsewhereBytes: number;
  homes: Home[];
  files: StoredFile[];
}

const counted = (count: number) => `${count} file${count === 1 ? '' : 's'}`;
const kindNames: Record<string, string> = { task: 'task', note: 'page', board: 'board' };

export function FilesPage({ tab }: { tab: Exclude<FilesTab, 'files'> }) {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const action = useAction();
  const storage = useResource<Storage>('/me/storage', true, { live: ['items'] });
  const [sort, setSort] = useState<BrowserSort>({ key: 'updatedAt', descending: true });
  const shown = storage.data;
  const inSpaces = (shown?.files ?? [])
    .filter((file) => file.spaceId)
    .map((file) => ({
      ...file,
      kind: 'file' as const,
      updatedAt: file.createdAt,
      detail: file.attachedTo && `On the ${kindNames[file.attachedTo.kind] ?? 'item'} ${file.attachedTo.title || 'Untitled'}`,
    }));
  const [fileRows] = useRememberedShape('files', shown && [inSpaces.length], [4]);
  const writable = (file: StoredFile) => spaces.data?.some((space) => space.id === file.spaceId && space.role !== 'viewer');

  const download = (files: StoredFile[]) =>
    void action.run(async () => {
      for (const file of files) saveBlob(await auth.request<Blob>(`/files/${file.id}`, {}, readBlob), file.name);
      return '';
    }, 'Could not download the files');

  const trash = (files: StoredFile[]) => {
    const trashed = files.filter(writable);
    if (trashed.length === 0) return;
    void action.run(async () => {
      await Promise.all(trashed.map((file) => auth.request(`/items/${file.id}/trash`, { method: 'POST' })));
      storage.reload();
      return {
        message: `Moved ${trashed.length === 1 ? trashed[0]!.name : counted(trashed.length)} to the trash.`,
        undo: async () => {
          await Promise.all(trashed.map((file) => auth.request(`/items/${file.id}/restore`, { method: 'POST' })));
          storage.reload();
          return '';
        },
      };
    }, 'Could not move the files to the trash');
  };

  return (
    <Page actions={tab === 'spaces' && <FilterMenu groups={sortGroups(sort, setSort)} label="Sort" large />} tabs={filesTabs(tab)} title="Files">
      {storage.error ? (
        <LoadError error={storage.error} onRetry={storage.reload} />
      ) : !shown ? (
        <Placeholder className="grid gap-8" label="Adding up your files">
          {tab === 'storage' ? (
            <Card className="gap-2">
              <SkeletonLine width="w-48" />
              <Skeleton className="h-1.5 rounded-full" />
              <HintSkeleton />
            </Card>
          ) : (
            <RowsSkeleton lead={<IconSkeleton />} rows={fileRows ?? 4} trail={<IconButtonSkeleton />} />
          )}
        </Placeholder>
      ) : tab === 'storage' ? (
        <StorageCard spaces={spaces.data ?? []} storage={shown} />
      ) : (spaces.data ?? []).length === 0 ? (
        <Empty title="No spaces">Images and attachments you add to pages and tasks in a space show here.</Empty>
      ) : (
        <FileBrowser
          idle={<Hint>Images and attachments added to pages and tasks stay with their space, and count toward your storage.</Hint>}
          label="Files in your spaces"
          menu={(selection) => {
            const attached = selection.length === 1 ? selection[0]!.attachedTo : null;
            return [
              { icon: 'download', label: 'Download', onSelect: () => download(selection) },
              ...(attached && itemHref(attached) ? [{ label: `Open the ${kindNames[attached.kind] ?? 'item'}`, href: itemHref(attached)! }] : []),
              ...(selection.some(writable) ? [{ icon: 'trash' as const, label: 'Move to trash', separated: true, onSelect: () => trash(selection) }] : []),
            ];
          }}
          onDelete={trash}
          onDownload={download}
          onSort={setSort}
          sections={(spaces.data ?? []).map((space) => {
            const home = shown.homes.find((candidate) => candidate.spaceId === space.id);
            return {
              key: space.id,
              heading: (
                <>
                  <SpaceMark space={space} />
                  <span className="min-w-0 flex-1 truncate text-ink">{space.name}</span>
                  <span className="shrink-0 text-small text-muted tabular-nums">{home ? `${counted(home.count)} · ${fileSize(home.sizeBytes)}` : 'No files'}</span>
                </>
              ),
              entries: inSpaces.filter((file) => file.spaceId === space.id),
              empty: <Hint>Nothing you added to pages or tasks in {space.name} is a file yet.</Hint>,
            };
          })}
          sort={sort}
        />
      )}
    </Page>
  );
}

function StorageCard({ spaces, storage }: { spaces: Space[]; storage: Storage }) {
  const parts = [
    ...storage.homes.map((home) => ({
      key: home.spaceId ?? 'mine',
      label: home.spaceId ? (spaces.find((space) => space.id === home.spaceId)?.name ?? home.spaceName ?? 'A space') : 'Your files',
      bytes: home.sizeBytes,
      to: undefined as string | undefined,
    })),
    ...(storage.elsewhereBytes > 0 ? [{ key: 'elsewhere', label: 'Spaces you have left', bytes: storage.elsewhereBytes, to: undefined }] : []),
    ...(storage.trashedBytes > 0 ? [{ key: 'trash', label: 'Trash', bytes: storage.trashedBytes, to: '/settings/trash' }] : []),
  ];
  return (
    <Card className="gap-3">
      <div className="grid gap-2">
        <p className="m-0 text-body text-ink tabular-nums">
          {fileSize(storage.usedBytes)} of {fileSize(storage.quotaBytes)} used
        </p>
        <Meter label="Storage used" value={storage.quotaBytes ? storage.usedBytes / storage.quotaBytes : 1} />
      </div>
      {parts.length > 0 && (
        <ul aria-label="Where your storage goes" className="files-breakdown">
          {parts.map((part) => (
            <li key={part.key}>
              {part.to ? <Link to={part.to}>{part.label}</Link> : <span>{part.label}</span>}
              <span className="tabular-nums">{fileSize(part.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
      <Hint>Up to {fileSize(maxUploadBytes)} a file. Everything you upload counts, wherever it lives, until it is deleted from the trash.</Hint>
    </Card>
  );
}
