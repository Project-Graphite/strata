import { Link } from 'react-router';
import { Card, Meter, Placeholder, Skeleton } from '@project-graphite/ui';
import { fileSize, filesTabs, maxUploadBytes } from '../files';
import { Hint } from '../components/Hint';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { useAllSpaces, type Space } from '../spaces';
import { useResource } from '../useResource';
import { HintSkeleton, SkeletonLine } from '../components/Skeletons';

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
}

export function FilesPage() {
  const spaces = useAllSpaces();
  const storage = useResource<Storage>('/me/storage', true, { live: ['items'] });

  return (
    <Page tabs={filesTabs('storage')} title="Files">
      {storage.error ? (
        <LoadError error={storage.error} onRetry={storage.reload} />
      ) : !storage.data ? (
        <Placeholder className="grid gap-8" label="Adding up your files">
          <Card className="gap-2">
            <SkeletonLine width="w-48" />
            <Skeleton className="h-1.5 rounded-full" />
            <HintSkeleton />
          </Card>
        </Placeholder>
      ) : (
        <StorageCard spaces={spaces.data ?? []} storage={storage.data} />
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
