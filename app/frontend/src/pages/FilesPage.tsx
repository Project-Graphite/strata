import { useState } from 'react';
import { Link } from 'react-router';
import { Card, ConfirmDialog, Icon, ListRow, Meter, Placeholder, SegmentedControl, Skeleton } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { FilePreview, fileSize, maxUploadBytes, previewable, saveBlob, uploadFile, uploadFiles } from '../files';
import { ActionsMenu } from '../components/ActionsMenu';
import { Empty } from '../components/Empty';
import { FileButton } from '../components/FileButton';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { ShareLinks } from '../components/ShareLinks';
import { itemHref, SpaceMark, useAllSpaces, type Space } from '../spaces';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { HintSkeleton, IconButtonSkeleton, IconSkeleton, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';

const empty = { title: 'No files in your library', hint: 'Files you upload here are yours alone, whichever space you are in.' };

interface StoredFile {
  id: string;
  spaceId: string | null;
  spaceName: string | null;
  attachedTo: { id: string; kind: string; title: string } | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  public: boolean;
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

type Sort = 'newest' | 'name' | 'size';

const sorters: Record<Sort, (a: StoredFile, b: StoredFile) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => b.sizeBytes - a.sizeBytes,
};

const counted = (count: number) => `${count} file${count === 1 ? '' : 's'}`;
const kindNames: Record<string, string> = { task: 'task', note: 'page', board: 'board' };

export function FilesPage() {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const action = useAction();
  const storage = useResource<Storage>('/me/storage', true, { live: ['items'] });
  const [sort, setSort] = useState<Sort>('newest');
  const shown = storage.data;
  const sorted = [...(shown?.files ?? [])].sort(sorters[sort]);
  const mine = sorted.filter((file) => !file.spaceId && !file.public);
  const shared = sorted.filter((file) => !file.spaceId && file.public);
  const [sharing, setSharing] = useState<StoredFile>();
  const [unpublishing, setUnpublishing] = useState<StoredFile>();
  const publish = (file: StoredFile, value: boolean) =>
    void action.run(async () => {
      await auth.request(`/files/${file.id}`, { method: 'PATCH', body: JSON.stringify({ public: value }) });
      storage.reload();
      return value ? `Moved ${file.name} to your public folder.` : `Moved ${file.name} out of your public folder and turned off its links.`;
    }, 'Could not move the file');
  const [fileRows] = useRememberedShape('files', shown && [shown.files.length], [4]);
  const writable = (spaceId: string | null) => !spaceId || spaces.data?.some((space) => space.id === spaceId && space.role !== 'viewer');

  const row = (file: StoredFile) => (
    <ListRow
      key={file.id}
      lead={previewable(file.mimeType) ? <FilePreview item={file} /> : <Icon name="file" size={18} />}
      meta={[
        fileSize(file.sizeBytes),
        formatMoment(file.createdAt),
        file.attachedTo && `on the ${kindNames[file.attachedTo.kind] ?? 'item'} ${file.attachedTo.title || 'Untitled'}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      title={file.name}
      trail={
        <ActionsMenu
          items={[
            {
              label: 'Download',
              onSelect: () =>
                void action.run(async () => {
                  saveBlob(await auth.request<Blob>(`/files/${file.id}`, {}, readBlob), file.name);
                  return '';
                }, 'Could not download the file'),
            },
            ...(file.spaceId
              ? []
              : file.public
                ? [
                    { label: 'Share link', onSelect: () => setSharing(file) },
                    { label: 'Move out of the public folder', onSelect: () => setUnpublishing(file) },
                  ]
                : [{ label: 'Move to the public folder', onSelect: () => publish(file, true) }]),
            ...(file.attachedTo && itemHref(file.attachedTo) ? [{ label: `Open the ${kindNames[file.attachedTo.kind] ?? 'item'}`, href: itemHref(file.attachedTo)! }] : []),
            ...(writable(file.spaceId)
              ? [
                  {
                    label: 'Move to trash',
                    separated: true,
                    onSelect: () =>
                      void action.run(async () => {
                        await auth.request(`/items/${file.id}/trash`, { method: 'POST' });
                        storage.reload();
                        return {
                          message: `Moved ${file.name} to the trash.`,
                          undo: async () => {
                            await auth.request(`/items/${file.id}/restore`, { method: 'POST' });
                            storage.reload();
                            return '';
                          },
                        };
                      }, 'Could not move the file to the trash'),
                  },
                ]
              : []),
          ]}
          name={file.name}
        />
      }
    />
  );

  return (
    <Page
      actions={
        <FileButton
          busy={action.busy}
          inputLabel="Files to upload"
          label={action.busy ? 'Uploading…' : 'Upload files'}
          large
          multiple
          onFiles={(files) =>
            void action.run(async () => {
              const message = await uploadFiles(auth.request, null, files);
              storage.reload();
              return message;
            }, 'Could not upload the files')
          }
          primary
        />
      }
      title="Files"
      toolbar={
        shown &&
        shown.files.length > 1 && (
          <SegmentedControl
            label="Sort files"
            onChange={setSort}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'name', label: 'Name' },
              { value: 'size', label: 'Size' },
            ]}
            size="small"
            value={sort}
          />
        )
      }
    >
      {storage.error ? (
        <LoadError error={storage.error} onRetry={storage.reload} />
      ) : !shown ? (
        <Placeholder className="grid gap-8" label="Adding up your files">
          <Card className="gap-2">
            <SkeletonLine width="w-48" />
            <Skeleton className="h-1.5 rounded-full" />
            <HintSkeleton />
          </Card>
          {fileRows ? (
            <RowsSkeleton lead={<IconSkeleton />} rows={fileRows} trail={<IconButtonSkeleton />} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : (
        <>
          <StorageCard spaces={spaces.data ?? []} storage={shown} />
          <Section
            action={
              <FileButton
                busy={action.busy}
                inputLabel="Files to add to your public folder"
                label="Upload"
                multiple
                onFiles={(files) =>
                  void action.run(async () => {
                    for (const file of files) {
                      const added = await uploadFile(auth.request, null, file);
                      await auth.request(`/files/${added.id}`, { method: 'PATCH', body: JSON.stringify({ public: true }) });
                    }
                    storage.reload();
                    return files.length === 1 ? `Added ${files[0]!.name} to your public folder.` : `Added ${files.length} files to your public folder.`;
                  }, 'Could not upload the files')
                }
              />
            }
            description="Anything here can be shared with a link that lasts from 30 minutes to forever."
            title="Public folder"
          >
            {shared.length === 0 ? <Hint>Move a file here from your files, or upload one, to share it with a link.</Hint> : <ul className="panel-rows">{shared.map(row)}</ul>}
          </Section>
          <Section description={`${counted(mine.length)} · ${fileSize(mine.reduce((total, file) => total + file.sizeBytes, 0))}`} title="Your files">
            {mine.length === 0 ? <Empty title={empty.title}>{empty.hint}</Empty> : <ul className="panel-rows">{mine.map(row)}</ul>}
          </Section>
          {(spaces.data ?? []).length > 0 && (
            <Section description="Images and attachments added to pages and tasks stay with their space, and count toward your storage." title="In your spaces">
              {(spaces.data ?? []).map((space) => {
                const files = sorted.filter((file) => file.spaceId === space.id);
                const home = shown.homes.find((candidate) => candidate.spaceId === space.id);
                return (
                  <details className="files-group" key={space.id} open={files.length > 0}>
                    <summary>
                      <SpaceMark space={space} />
                      <span className="min-w-0 flex-1 truncate text-ink">{space.name}</span>
                      <span className="shrink-0 text-small text-muted tabular-nums">{home ? `${counted(home.count)} · ${fileSize(home.sizeBytes)}` : 'No files'}</span>
                    </summary>
                    {files.length === 0 ? (
                      <Hint>Nothing you added to pages or tasks in {space.name} is a file yet.</Hint>
                    ) : (
                      <ul className="panel-rows">{files.map(row)}</ul>
                    )}
                  </details>
                );
              })}
            </Section>
          )}
        </>
      )}
      {sharing && <ShareLinks editLinks={false} itemId={sharing.id} noun={sharing.name} onClose={() => setSharing(undefined)} />}
      {unpublishing && (
        <ConfirmDialog
          busyLabel="Moving…"
          confirmLabel="Move out"
          errorFallback="Could not move the file"
          onClose={() => setUnpublishing(undefined)}
          onConfirm={async () => publish(unpublishing, false)}
          title={`Move ${unpublishing.name} out of the public folder?`}
          tone="danger"
        >
          Every link to this file stops working.
        </ConfirmDialog>
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
