import { Link } from 'react-router';
import { Card, Icon, ListRow, Meter, Placeholder, Skeleton } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { fileSize, maxUploadBytes, saveBlob, uploadFiles } from '../files';
import { ActionsMenu } from '../components/ActionsMenu';
import { Empty } from '../components/Empty';
import { FileButton } from '../components/FileButton';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { useAllSpaces } from '../spaces';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { HintSkeleton, IconButtonSkeleton, IconSkeleton, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';

const empty = { title: 'No files yet', hint: 'Files you upload here are yours alone. Files you attach to pages and tasks in a space are listed below them.' };

interface StoredFile {
  id: string;
  spaceId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Storage {
  quotaBytes: number;
  usedBytes: number;
  trashedBytes: number;
  files: StoredFile[];
}

export function FilesPage() {
  const auth = useAuth();
  const spaces = useAllSpaces();
  const action = useAction();
  const storage = useResource<Storage>('/me/storage', true);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const shown = storage.data;
  const mine = shown?.files.filter((file) => !file.spaceId) ?? [];
  const attached = new Map<string, StoredFile[]>();
  for (const file of shown?.files ?? []) if (file.spaceId) attached.set(file.spaceId, [...(attached.get(file.spaceId) ?? []), file]);
  const [fileRows] = useRememberedShape('files', shown && [shown.files.length], [4]);

  const row = (file: StoredFile) => (
    <ListRow
      key={file.id}
      lead={<Icon name="file" size={18} />}
      meta={[fileSize(file.sizeBytes), formatMoment(file.createdAt)].join(' · ')}
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
            ...(!file.spaceId || writable.some((space) => space.id === file.spaceId)
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
          <Card className="gap-2">
            <p className="m-0 text-body text-ink tabular-nums">
              {fileSize(shown.usedBytes)} of {fileSize(shown.quotaBytes)} used
            </p>
            <Meter label="Storage used" value={shown.quotaBytes ? shown.usedBytes / shown.quotaBytes : 1} />
            <Hint>
              Up to {fileSize(maxUploadBytes)} a file. Everything you upload counts, including attachments in spaces.
              {shown.trashedBytes > 0 && (
                <>
                  {' '}
                  {fileSize(shown.trashedBytes)} is in the <Link to="/settings/trash">trash</Link> and still counts until it’s emptied.
                </>
              )}
            </Hint>
          </Card>
          {mine.length === 0 ? <Empty title={empty.title}>{empty.hint}</Empty> : <ul className="panel-rows">{mine.map(row)}</ul>}
          {[...attached].map(([spaceId, files]) => (
            <Section key={spaceId} level={3} title={`Attached in ${spaces.data?.find((space) => space.id === spaceId)?.name ?? 'a space'}`}>
              <ul className="panel-rows">{files.map(row)}</ul>
            </Section>
          ))}
        </>
      )}
    </Page>
  );
}
