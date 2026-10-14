import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, formatDay, Icon, ListSkeleton, Menu, Meter, Select } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { fileSize, maxUploadBytes, saveBlob, uploadFiles } from '../files';
import { LoadError } from '../components/LoadError';
import { Page, Section } from '../components/Page';
import { spaceOptions, useSpaces } from '../spaces';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

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

export function StoragePage() {
  const auth = useAuth();
  const spaces = useSpaces();
  const action = useAction();
  const storage = useResource<Storage>('/me/storage', true);
  const writable = (spaces.data ?? []).filter((space) => space.role !== 'viewer');
  const [chosen, setChosen] = useState<string>();
  const target = chosen ?? writable.find((space) => space.kind === 'personal')?.id ?? writable[0]?.id;
  const spaceName = (id: string) => spaces.data?.find((space) => space.id === id)?.name;
  const shown = storage.data;

  return (
    <Page
      actions={
        target && (
          <label className={`primary-button px-3 py-2 text-sm ${action.busy ? 'opacity-60' : ''}`}>
            <Icon name="upload" size={16} />
            {action.busy ? 'Uploading…' : 'Upload files'}
            <input
              aria-label="Files to upload"
              className="sr-only"
              disabled={action.busy}
              multiple
              onChange={(event) => {
                const files = [...(event.currentTarget.files ?? [])];
                event.currentTarget.value = '';
                if (files.length === 0) return;
                void action.run(async () => {
                  const message = await uploadFiles(auth.request, target, files);
                  storage.reload();
                  return message;
                }, 'Could not upload the files');
              }}
              type="file"
            />
          </label>
        )
      }
      title="Storage"
    >
      {storage.error ? (
        <LoadError error={storage.error} onRetry={storage.reload} />
      ) : !shown ? (
        <ListSkeleton label="Adding up your files" rows={4} />
      ) : (
        <>
          <div className="grid max-w-xl gap-2">
            <p className="m-0 text-ink">
              {fileSize(shown.usedBytes)} of {fileSize(shown.quotaBytes)} used
            </p>
            <Meter label="Storage used" value={shown.quotaBytes ? shown.usedBytes / shown.quotaBytes : 1} />
            <p className="m-0 text-sm text-muted">
              Up to {fileSize(maxUploadBytes)} a file.
              {shown.trashedBytes > 0 && (
                <>
                  {' '}
                  {fileSize(shown.trashedBytes)} is in the <Link to="/trash">trash</Link> and still counts until it is emptied.
                </>
              )}
            </p>
          </div>
          {writable.length > 1 && target && (
            <div className="max-w-xs">
              <Select label="Upload to" onChange={setChosen} options={spaceOptions(writable)} value={target} />
            </div>
          )}
          <Section title="Files">
            {shown.files.length === 0 ? (
              <EmptyState title="No files yet" />
            ) : (
              <ul className="panel-rows">
                {shown.files.map((file) => (
                  <li className="panel-row flex items-center gap-3" key={file.id}>
                    <Icon name="file" size={18} />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-ink">{file.name}</span>
                      <span className="truncate text-sm text-muted">
                        {[fileSize(file.sizeBytes), formatDay(file.createdAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }), spaceName(file.spaceId)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Menu
                      items={[
                        {
                          label: 'Download',
                          onSelect: () =>
                            void action.run(async () => {
                              saveBlob(await auth.request<Blob>(`/files/${file.id}`, {}, readBlob), file.name);
                              return '';
                            }, 'Could not download the file'),
                        },
                        {
                          label: 'Move to trash',
                          separated: true,
                          onSelect: () =>
                            void action.run(async () => {
                              await auth.request(`/items/${file.id}/trash`, { method: 'POST' });
                              storage.reload();
                              return `Moved ${file.name} to the trash.`;
                            }, 'Could not move the file to the trash'),
                        },
                      ]}
                      label={`${file.name} actions`}
                      trigger={<Icon name="more" size={18} />}
                      triggerClassName="icon-button"
                      triggerLabel={`Actions for ${file.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
