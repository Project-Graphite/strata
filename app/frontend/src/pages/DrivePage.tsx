import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon, IconButton, Placeholder, TextField } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { connectGoogle, googleAllowed, pickDriveFiles, type GoogleStatus } from '../google';
import { filesTabs, saveBlob, uploadFiles, type DriveEntry, type DriveListing } from '../files';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FileBrowser, type BrowserSort } from '../components/FileBrowser';
import { FileButton } from '../components/FileButton';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { ShareLinks } from '../components/ShareLinks';
import { IconSkeleton, RowsSkeleton } from '../components/Skeletons';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { required, useFormErrors } from '../validation';

const driveHref = (folderId: string | null) => (folderId ? `/files?folder=${folderId}` : '/files');
const dragType = 'application/x-strata-drive';
const counted = (count: number) => `${count} item${count === 1 ? '' : 's'}`;

function MoveDialog({ entries, onClose, onMove }: { entries: DriveEntry[]; onClose: () => void; onMove: (folderId: string | null, name: string) => void }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const listing = useResource<DriveListing>(`/me/drive${folderId ? `?folderId=${folderId}` : ''}`, true);
  const moving = new Set(entries.map((entry) => entry.id));
  const here = listing.data?.path.at(-1);
  return (
    <FormDialog
      busy={false}
      busyLabel="Moving…"
      onClose={onClose}
      onSubmit={() => onMove(folderId, here?.name ?? 'Files')}
      submitDisabled={!listing.data || moving.has(folderId ?? '')}
      submitLabel="Move here"
      title={entries.length === 1 ? `Move ${entries[0]!.name}` : `Move ${counted(entries.length)}`}
    >
      <nav aria-label="Folder path" className="drive-path">
        <button className="drive-crumb" onClick={() => setFolderId(null)} type="button">
          Files
        </button>
        {listing.data?.path.map((step) => (
          <span className="contents" key={step.id}>
            <Icon name="chevron-right" size={14} />
            <button className="drive-crumb" onClick={() => setFolderId(step.id)} type="button">
              {step.name}
            </button>
          </span>
        ))}
      </nav>
      {listing.error ? (
        <LoadError compact error={listing.error} onRetry={listing.reload} />
      ) : !listing.data ? (
        <Placeholder label="Loading folders">
          <RowsSkeleton lead={<IconSkeleton />} rows={3} />
        </Placeholder>
      ) : (
        <ul className="panel-rows max-h-72 overflow-y-auto">
          {listing.data.entries
            .filter((entry) => entry.kind === 'folder')
            .map((folder) => (
              <li className="list-row" key={folder.id}>
                <button className="list-row-main" disabled={moving.has(folder.id)} onClick={() => setFolderId(folder.id)} type="button">
                  <span className="list-row-lead">
                    <Icon name="folder" size={18} />
                  </span>
                  <span className="list-row-text">
                    <span className="list-row-title">{folder.name}</span>
                  </span>
                </button>
              </li>
            ))}
          {listing.data.entries.every((entry) => entry.kind !== 'folder') && <li className="list-row text-small text-muted">No folders here</li>}
        </ul>
      )}
    </FormDialog>
  );
}

function NameDialog({ initial, onClose, onSave, submitLabel, title }: { initial: string; onClose: () => void; onSave: (name: string) => Promise<unknown>; submitLabel: string; title: string }) {
  const form = useFormErrors();
  const [busy, setBusy] = useState(false);
  return (
    <FormDialog
      busy={busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={(target) => {
        if (!form.check(target, { name: [required('Give it a name.')] })) return;
        setBusy(true);
        void onSave(String(new FormData(target).get('name')).trim()).finally(() => setBusy(false));
      }}
      submitLabel={submitLabel}
      title={title}
    >
      <TextField autoFocus defaultValue={initial} label="Name" maxLength={200} {...form.field('name')} />
    </FormDialog>
  );
}

export function DrivePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  const [params] = useSearchParams();
  const folderId = params.get('folder');
  const spaceId = params.get('space');
  const listing = useResource<DriveListing>(`/me/drive${spaceId ? `?spaceId=${spaceId}` : folderId ? `?folderId=${folderId}` : ''}`, true, { live: ['items'] });
  const [sort, setSort] = useState<BrowserSort>({ key: 'name', descending: false });
  const [dialog, setDialog] = useState<{ kind: 'folder' } | { kind: 'rename' | 'share'; entry: DriveEntry } | { kind: 'move'; entries: DriveEntry[] }>();
  const [over, setOver] = useState<string | null>();
  const picker = useRef<HTMLInputElement>(null);
  const google = useResource<GoogleStatus>(googleAllowed ? '/me/google' : null, true);
  const spaceFolders = new Set(listing.data?.spaces?.map((space) => space.id));
  const entries: (DriveEntry & { detail?: string })[] = [
    ...(listing.data?.entries ?? []),
    ...(listing.data?.spaces ?? []).map((space) => ({ id: space.id, kind: 'folder' as const, name: space.name, mimeType: null, sizeBytes: null, createdAt: null, updatedAt: space.updatedAt ?? null, detail: `Space · ${space.fileCount ?? 0} file${space.fileCount === 1 ? '' : 's'}` })),
  ];
  const ownEntries = (selection: DriveEntry[]) => selection.filter((entry) => !spaceFolders.has(entry.id));
  const writable = !listing.data?.space || listing.data.space.role !== 'viewer';

  const move = (moved: DriveEntry[], target: string | null, name: string) =>
    void action.run(async () => {
      await auth.request('/me/drive/move', { method: 'POST', body: JSON.stringify({ itemIds: moved.map((entry) => entry.id), folderId: target }) });
      setDialog(undefined);
      listing.reload();
      return `Moved ${moved.length === 1 ? moved[0]!.name : counted(moved.length)} to ${name}.`;
    }, 'Could not move them');

  const trash = (selection: DriveEntry[]) => {
    const trashed = ownEntries(selection);
    if (trashed.length === 0 || !writable) return;
    const itemIds = trashed.map((entry) => entry.id);
    const send = (restore: boolean) =>
      spaceId
        ? Promise.all(itemIds.map((itemId) => auth.request(`/items/${itemId}/${restore ? 'restore' : 'trash'}`, { method: 'POST' })))
        : auth.request(`/me/drive/${restore ? 'restore' : 'trash'}`, { method: 'POST', body: JSON.stringify({ itemIds }) });
    void action.run(async () => {
      await send(false);
      listing.reload();
      return {
        message: `Moved ${trashed.length === 1 ? trashed[0]!.name : counted(trashed.length)} to the trash.`,
        undo: async () => {
          await send(true);
          listing.reload();
          return '';
        },
      };
    }, 'Could not move them to the trash');
  };

  const download = (files: DriveEntry[]) =>
    void action.run(async () => {
      for (const file of files.filter((entry) => entry.kind === 'file')) saveBlob(await auth.request<Blob>(`/files/${file.id}`, {}, readBlob), file.name);
      return files.some((entry) => entry.kind === 'folder') ? 'Folders are not downloaded, only the files you chose.' : '';
    }, 'Could not download the files');

  const upload = (files: File[]) =>
    void action.run(async () => {
      const message = await uploadFiles(auth.request, spaceId, files, folderId);
      listing.reload();
      return message;
    }, 'Could not upload the files');

  const importFromDrive = () =>
    void action.run(async () => {
      if (!google.data?.account?.drive) {
        await connectGoogle(auth.request, 'drive', `/files${window.location.search}`);
        return '';
      }
      const fileIds = await pickDriveFiles(auth.request);
      if (fileIds.length === 0) return '';
      const { imported, failed } = await auth.request<{ imported: unknown[]; failed: { name: string; reason: string }[] }>('/me/google/drive', {
        method: 'POST',
        body: JSON.stringify({ fileIds, ...(spaceId ? { spaceId } : folderId ? { folderId } : {}) }),
      });
      listing.reload();
      const skipped = failed.map((file) => `${file.name}: ${file.reason}`).join('; ');
      if (imported.length === 0) throw new Error(skipped || 'Nothing was imported');
      return `Imported ${imported.length === 1 ? 'one file' : `${imported.length} files`} from Google Drive.${skipped ? ` Skipped ${skipped}.` : ''}`;
    }, 'Could not import from Google Drive');

  const dragged = (event: DragEvent) => {
    const raw = event.dataTransfer.getData(dragType);
    return raw ? entries.filter((entry) => (JSON.parse(raw) as string[]).includes(entry.id)) : [];
  };

  const dropOn = (target: string | null, name: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(dragType)) return;
      event.preventDefault();
      setOver(target);
    },
    onDragLeave: () => setOver(undefined),
    onDrop: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(dragType)) return;
      event.preventDefault();
      event.stopPropagation();
      setOver(undefined);
      const moved = dragged(event).filter((entry) => entry.id !== target);
      if (moved.length > 0) move(moved, target, name);
    },
  });

  const path = listing.data?.path ?? [];

  return (
    <Page
      actions={
        writable && (
          <>
            {!spaceId && <Button icon="folder" label="New folder" large onClick={() => setDialog({ kind: 'folder' })} />}
            {google.data?.picker && <IconButton disabled={action.busy} icon="download" label="Import from Google Drive" onClick={importFromDrive} />}
            <FileButton busy={action.busy} inputLabel="Files to upload" label={''} large multiple onFiles={upload} primary />
          </>
        )
      }
      tabs={filesTabs('files')}
      title="Files"
    >
      <div
        className="drive"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0 || !writable) return;
          event.preventDefault();
          upload([...event.dataTransfer.files]);
        }}
      >
        {listing.error ? (
          <LoadError error={listing.error} onRetry={listing.reload} />
        ) : !listing.data ? (
          <Placeholder label="Loading your files">
            <RowsSkeleton lead={<IconSkeleton />} rows={4} />
          </Placeholder>
        ) : (
          <FileBrowser
            backgroundMenu={[
              ...(spaceId ? [] : [{ label: 'New folder', onSelect: () => setDialog({ kind: 'folder' }) }]),
              ...(writable ? [{ label: 'Upload files', onSelect: () => picker.current?.click() }] : []),
            ]}
            idle={
              <nav aria-label="Folder path" className="drive-path">
                <Link className="drive-crumb" data-over={over === null || undefined} to={driveHref(null)} {...dropOn(null, 'Files')}>
                  Files
                </Link>
                {path.map((step, index) => (
                  <span className="contents" key={step.id}>
                    <Icon name="chevron-right" size={14} />
                    {index === path.length - 1 ? (
                      <span aria-current="page" className="drive-crumb text-ink">
                        {step.name}
                      </span>
                    ) : (
                      <Link className="drive-crumb" data-over={over === step.id || undefined} to={driveHref(step.id)} {...dropOn(step.id, step.name)}>
                        {step.name}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>
            }
            key={spaceId ?? folderId ?? 'files'}
            label="Files and folders"
            menu={(selection) => {
              const own = ownEntries(selection);
              const managed = !spaceId && own.length === selection.length;
              return [
                ...(managed && selection.length === 1 ? [{ icon: 'link' as const, label: 'Share', onSelect: () => setDialog({ kind: 'share', entry: selection[0]! }) }] : []),
                ...(own.some((entry) => entry.kind === 'file') ? [{ icon: 'download' as const, label: 'Download', onSelect: () => download(own) }] : []),
                ...(managed && selection.length === 1 ? [{ label: 'Rename', onSelect: () => setDialog({ kind: 'rename', entry: selection[0]! }) }] : []),
                ...(managed ? [{ icon: 'folder' as const, label: 'Move to…', onSelect: () => setDialog({ kind: 'move', entries: selection }) }] : []),
                ...(writable && own.length > 0 ? [{ icon: 'trash' as const, label: 'Move to trash', separated: true, onSelect: () => trash(own) }] : []),
              ];
            }}
            onDelete={trash}
            onDownload={download}
            onOpenFolder={(folder) => navigate(spaceFolders.has(folder.id) ? `/files?space=${folder.id}` : driveHref(folder.id))}
            onSort={setSort}
            rowProps={(entry, selection) => spaceId || spaceFolders.has(entry.id) ? {} : ({
              draggable: true,
              onDragStart: (event) => {
                event.dataTransfer.setData(dragType, JSON.stringify((selection.includes(entry) ? selection : [entry]).map((dragging) => dragging.id)));
                event.dataTransfer.effectAllowed = 'move';
              },
              ...(entry.kind === 'folder' ? { 'data-over': over === entry.id || undefined, ...dropOn(entry.id, entry.name) } : {}),
            })}
            sections={[
              {
                key: 'here',
                entries,
                empty: (
                  <Empty
                    action={writable && <FileButton busy={action.busy} inputLabel="Files to upload" label="Upload files" multiple onFiles={upload} />}
                    icon="folder"
                    title={folderId || spaceId ? 'This folder is empty' : 'No files yet'}
                    variant="page"
                  >
                    Upload files or drop them here. Everything is private until you share it.
                  </Empty>
                ),
              },
            ]}
            sort={sort}
          />
        )}
        <input
          aria-hidden="true"
          className="sr-only"
          multiple
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = '';
            if (files.length) upload(files);
          }}
          ref={picker}
          tabIndex={-1}
          type="file"
        />
      </div>
      {dialog?.kind === 'folder' && (
        <NameDialog
          initial=""
          onClose={() => setDialog(undefined)}
          onSave={(name) =>
            action.run(async () => {
              await auth.request('/me/folders', { method: 'POST', body: JSON.stringify({ name, ...(folderId ? { parentId: folderId } : {}) }) });
              setDialog(undefined);
              listing.reload();
              return `Made the folder ${name}.`;
            }, 'Could not make the folder')
          }
          submitLabel="Make folder"
          title="New folder"
        />
      )}
      {dialog?.kind === 'rename' && (
        <NameDialog
          initial={dialog.entry.name}
          onClose={() => setDialog(undefined)}
          onSave={(name) =>
            action.run(async () => {
              await auth.request(`/me/drive/${dialog.entry.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
              setDialog(undefined);
              listing.reload();
              return `Renamed it to ${name}.`;
            }, 'Could not rename it')
          }
          submitLabel="Rename"
          title={`Rename ${dialog.entry.name}`}
        />
      )}
      {dialog?.kind === 'move' && <MoveDialog entries={dialog.entries} onClose={() => setDialog(undefined)} onMove={(target, name) => move(dialog.entries, target, name)} />}
      {dialog?.kind === 'share' && (
        <ShareLinks
          editLinks={false}
          itemId={dialog.entry.id}
          noun={dialog.entry.name}
          onClose={() => {
            setDialog(undefined);
            listing.reload();
          }}
        />
      )}
    </Page>
  );
}
