import { Link } from 'react-router';
import { formatDay, Icon, Meter, Placeholder, Skeleton } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { fileSize, maxUploadBytes, saveBlob, uploadFiles } from '../files';
import { ActionsMenu } from '../components/ActionsMenu';
import { Empty } from '../components/Empty';
import { FileButton } from '../components/FileButton';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { RowText } from '../components/RowText';
import { HintSkeleton, IconButtonSkeleton, IconSkeleton, RowsSkeleton, SkeletonLine, useRememberedShape } from '../components/Skeletons';

const empty = { title: 'No files yet', hint: 'Files in this space show up here.' };

interface StoredFile {
  id: string;
  spaceId: string;
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
  const spaces = useSpaces();
  const action = useAction();
  const storage = useResource<Storage>('/me/storage', true);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const target = writable[0]?.id;
  const spaceName = (id: string) => spaces.data?.find((space) => space.id === id)?.name;
  const shown = storage.data;
  const [fileRows] = useRememberedShape('files', shown && [shown.files.length], [4]);

  return (
    <Page
      actions={
        target && (
          <FileButton
            busy={action.busy}
            inputLabel="Files to upload"
            label={action.busy ? 'Uploading…' : 'Upload files'}
            multiple
            onFiles={(files) =>
              void action.run(async () => {
                const message = await uploadFiles(auth.request, target, files);
                storage.reload();
                return message;
              }, 'Could not upload the files')
            }
            primary
          />
        )
      }
      title="Files"
    >
      {storage.error ? (
        <LoadError error={storage.error} onRetry={storage.reload} />
      ) : !shown ? (
        <Placeholder className="grid gap-8" label="Adding up your files">
          <div className="grid gap-2 rounded-panel border border-line bg-surface p-4">
            <SkeletonLine className="text-lg" width="w-48" />
            <Skeleton className="h-1.5 rounded-full" />
            <HintSkeleton />
          </div>
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
          <div className="grid gap-2 rounded-panel border border-line bg-surface p-4">
            <p className="m-0 text-lg text-ink">
              {fileSize(shown.usedBytes)} of {fileSize(shown.quotaBytes)} used
            </p>
            <Meter label="Storage used" value={shown.quotaBytes ? shown.usedBytes / shown.quotaBytes : 1} />
            <Hint>
              Up to {fileSize(maxUploadBytes)} a file.
              {shown.trashedBytes > 0 && (
                <>
                  {' '}
                  {fileSize(shown.trashedBytes)} is in the <Link to="/settings/trash">trash</Link> and still counts until it’s emptied.
                </>
              )}
            </Hint>
          </div>
          {shown.files.length === 0 ? (
            <Empty title={empty.title}>{empty.hint}</Empty>
          ) : (
            <ul className="panel-rows">
              {shown.files.map((file) => (
                <li className="panel-row flex items-center gap-3" key={file.id}>
                  <span className="shrink-0 text-muted">
                    <Icon name="file" size={18} />
                  </span>
                  <RowText
                    detail={[fileSize(file.sizeBytes), formatDay(dayKey(new Date(file.createdAt)), { day: 'numeric', month: 'short', year: 'numeric' }), spaceName(file.spaceId)]
                      .filter(Boolean)
                      .join(' · ')}
                    title={file.name}
                  />
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
                      ...(writable.some((space) => space.id === file.spaceId) ? [{
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
                      }] : []),
                    ]}
                    name={file.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}
