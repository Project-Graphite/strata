import { useMemo, useState } from 'react';
import { Icon, Placeholder } from '@project-graphite/ui';
import { fileSize, saveBlob, type DriveListing } from '../files';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Empty } from './Empty';
import { sharedFiles } from './file-source';
import { LoadError } from './LoadError';
import { Page } from './Page';
import { IconSkeleton, RowsSkeleton } from './Skeletons';

export function SharedFolder({ code, name }: { code: string; name: string }) {
  const [folderId, setFolderId] = useState<string>();
  const load = useMemo(() => sharedFiles(code), [code]);
  const download = useAction();
  const listing = useResource<DriveListing>(`/share/${encodeURIComponent(code)}/folder${folderId ? `?folderId=${folderId}` : ''}`);
  const path = listing.data?.path ?? [];

  return (
    <Page description="Shared folder · view only" title={name} variant="panel">
      <div className="mt-6 grid gap-4">
        {path.length > 1 && (
          <nav aria-label="Folder path" className="drive-path">
            {path.map((step, index) => (
              <span className="contents" key={step.id}>
                {index > 0 && <Icon name="chevron-right" size={14} />}
                {index === path.length - 1 ? (
                  <span aria-current="page" className="drive-crumb text-ink">
                    {step.name}
                  </span>
                ) : (
                  <button className="drive-crumb" onClick={() => setFolderId(index === 0 ? undefined : step.id)} type="button">
                    {step.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}
        {listing.error ? (
          <LoadError error={listing.error} onRetry={listing.reload} />
        ) : !listing.data ? (
          <Placeholder label="Loading the folder">
            <RowsSkeleton lead={<IconSkeleton />} rows={3} />
          </Placeholder>
        ) : listing.data.entries.length === 0 ? (
          <Empty icon="folder" title="This folder is empty" />
        ) : (
          <ul className="panel-rows">
            {listing.data.entries.map((entry) => (
              <li className="list-row" key={entry.id}>
                <button
                  className="list-row-main"
                  disabled={entry.kind === 'file' && download.busy}
                  onClick={() =>
                    entry.kind === 'folder'
                      ? setFolderId(entry.id)
                      : void download.run(async () => {
                          saveBlob(await load(entry.id), entry.name);
                          return '';
                        }, 'Could not download the file')
                  }
                  type="button"
                >
                  <span className="drive-icon">
                    <Icon name={entry.kind === 'folder' ? 'folder' : 'file'} size={18} />
                  </span>
                  <span className="list-row-text">
                    <span className="list-row-title">{entry.name}</span>
                    <span className="list-row-meta">
                      {entry.kind === 'folder' ? 'Folder' : [entry.sizeBytes !== null && fileSize(entry.sizeBytes), formatMoment(entry.createdAt)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                {entry.kind === 'file' && (
                  <span className="list-row-trail">
                    <Icon name="download" size={16} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
