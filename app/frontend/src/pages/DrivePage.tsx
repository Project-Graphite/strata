import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Badge, Checkbox, Icon, IconButton, Placeholder, TextField } from '@project-graphite/ui';
import { readBlob } from '../api';
import { useAuth } from '../auth';
import { FilePreview, fileSize, filesTabs, previewable, saveBlob, uploadFiles, type DriveEntry, type DriveListing } from '../files';
import { ActionsMenu } from '../components/ActionsMenu';
import { Button } from '../components/Button';
import { Empty } from '../components/Empty';
import { FileButton } from '../components/FileButton';
import { FormDialog } from '../components/FormDialog';
import { LoadError } from '../components/LoadError';
import { Page } from '../components/Page';
import { ShareLinks } from '../components/ShareLinks';
import { IconSkeleton, RowsSkeleton } from '../components/Skeletons';
import { formatMoment } from '../time';
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
  const listing = useResource<DriveListing>(`/me/drive${folderId ? `?folderId=${folderId}` : ''}`, true, { live: ['items'] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<number>(undefined);
  const [dialog, setDialog] = useState<{ kind: 'folder' } | { kind: 'rename' | 'share'; entry: DriveEntry } | { kind: 'move'; entries: DriveEntry[] }>();
  const [over, setOver] = useState<string | null>();
  const entries = listing.data?.entries ?? [];
  const chosen = entries.filter((entry) => selected.has(entry.id));

  useEffect(() => {
    setSelected(new Set());
    anchor.current = undefined;
  }, [folderId]);

  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialog) setSelected(new Set());
    };
    window.addEventListener('keydown', clear);
    return () => window.removeEventListener('keydown', clear);
  }, [dialog]);

  function toggle(index: number, event: MouseEvent) {
    const entry = entries[index]!;
    setSelected((current) => {
      const next = new Set(current);
      if (event.shiftKey && anchor.current !== undefined) {
        const [from, to] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
        for (const ranged of entries.slice(from, to + 1)) next.add(ranged.id);
      } else if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
    anchor.current = index;
  }

  const move = (moved: DriveEntry[], target: string | null, name: string) =>
    void action.run(async () => {
      await auth.request('/me/drive/move', { method: 'POST', body: JSON.stringify({ itemIds: moved.map((entry) => entry.id), folderId: target }) });
      setSelected(new Set());
      setDialog(undefined);
      listing.reload();
      return `Moved ${moved.length === 1 ? moved[0]!.name : counted(moved.length)} to ${name}.`;
    }, 'Could not move them');

  const trash = (trashed: DriveEntry[]) =>
    void action.run(async () => {
      const itemIds = trashed.map((entry) => entry.id);
      await auth.request('/me/drive/trash', { method: 'POST', body: JSON.stringify({ itemIds }) });
      setSelected(new Set());
      listing.reload();
      return {
        message: `Moved ${trashed.length === 1 ? trashed[0]!.name : counted(trashed.length)} to the trash.`,
        undo: async () => {
          await auth.request('/me/drive/restore', { method: 'POST', body: JSON.stringify({ itemIds }) });
          listing.reload();
          return '';
        },
      };
    }, 'Could not move them to the trash');

  const download = (files: DriveEntry[]) =>
    void action.run(async () => {
      for (const file of files.filter((entry) => entry.kind === 'file')) saveBlob(await auth.request<Blob>(`/files/${file.id}`, {}, readBlob), file.name);
      return files.some((entry) => entry.kind === 'folder') ? 'Folders are not downloaded, only the files you chose.' : '';
    }, 'Could not download the files');

  const upload = (files: File[]) =>
    void action.run(async () => {
      const message = await uploadFiles(auth.request, null, files, folderId);
      listing.reload();
      return message;
    }, 'Could not upload the files');

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

  const menu = (entry: DriveEntry) => [
    ...(entry.kind === 'folder'
      ? [{ label: 'Open', onSelect: () => navigate(driveHref(entry.id)) }]
      : [{ label: 'Download', onSelect: () => download([entry]) }]),
    { label: 'Share', onSelect: () => setDialog({ kind: 'share', entry }) },
    { label: 'Rename', onSelect: () => setDialog({ kind: 'rename', entry }) },
    { label: 'Move to…', onSelect: () => setDialog({ kind: 'move', entries: [entry] }) },
    { label: 'Move to trash', separated: true, onSelect: () => trash([entry]) },
  ];

  const path = listing.data?.path ?? [];

  return (
    <Page
      actions={
        <>
          <Button icon="folder" label="New folder" large onClick={() => setDialog({ kind: 'folder' })} />
          <FileButton busy={action.busy} inputLabel="Files to upload" label={action.busy ? 'Working…' : 'Upload'} large multiple onFiles={upload} primary />
        </>
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
          if (event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          upload([...event.dataTransfer.files]);
        }}
      >
        {selected.size > 0 ? (
          <div aria-label="Selection" className="drive-selection" role="toolbar">
            <IconButton icon="x" label="Clear the selection" onClick={() => setSelected(new Set())} />
            <span className="mr-auto text-ink">{selected.size} selected</span>
            {chosen.some((entry) => entry.kind === 'file') && <Button icon="download" label="Download" onClick={() => download(chosen)} />}
            <Button icon="folder" label="Move to…" onClick={() => setDialog({ kind: 'move', entries: chosen })} />
            <Button icon="trash" label="Move to trash" onClick={() => trash(chosen)} />
          </div>
        ) : (
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
        )}
        {listing.error ? (
          <LoadError error={listing.error} onRetry={listing.reload} />
        ) : !listing.data ? (
          <Placeholder label="Loading your files">
            <RowsSkeleton lead={<IconSkeleton />} rows={4} />
          </Placeholder>
        ) : entries.length === 0 ? (
          <Empty
            action={<FileButton busy={action.busy} inputLabel="Files to upload" label="Upload files" multiple onFiles={upload} />}
            icon="folder"
            title={folderId ? 'This folder is empty' : 'No files yet'}
            variant="page"
          >
            Upload files or drop them here. Everything is private until you share it.
          </Empty>
        ) : (
          <ul aria-label="Files and folders" aria-multiselectable="true" className="panel-rows drive-rows" role="listbox">
            <li className="drive-head" role="presentation">
              <Checkbox
                aria-label="Select everything here"
                checked={selected.size === entries.length}
                onChange={() => setSelected(selected.size === entries.length ? new Set() : new Set(entries.map((entry) => entry.id)))}
              />
              <span className="text-small text-muted">Name</span>
            </li>
            {entries.map((entry, index) => (
              <li
                aria-selected={selected.has(entry.id)}
                className="list-row drive-row"
                data-over={(entry.kind === 'folder' && over === entry.id) || undefined}
                draggable
                key={entry.id}
                onDragStart={(event) => {
                  const ids = selected.has(entry.id) ? [...selected] : [entry.id];
                  event.dataTransfer.setData(dragType, JSON.stringify(ids));
                  event.dataTransfer.effectAllowed = 'move';
                }}
                role="option"
                {...(entry.kind === 'folder' ? dropOn(entry.id, entry.name) : {})}
              >
                <span className="list-row-lead">
                  <Checkbox aria-label={`Select ${entry.name}`} checked={selected.has(entry.id)} onClick={(event) => toggle(index, event)} readOnly />
                </span>
                {entry.kind === 'folder' ? (
                  <Link className="list-row-main" to={driveHref(entry.id)}>
                    <span className="drive-icon">
                      <Icon name="folder" size={18} />
                    </span>
                    <span className="list-row-text">
                      <span className="list-row-title">{entry.name}</span>
                      <span className="list-row-meta">Folder · {formatMoment(entry.updatedAt)}</span>
                    </span>
                  </Link>
                ) : (
                  <button className="list-row-main" onClick={() => download([entry])} type="button">
                    <span className="drive-icon">{entry.mimeType && previewable(entry.mimeType) ? <FilePreview item={entry} /> : <Icon name="file" size={18} />}</span>
                    <span className="list-row-text">
                      <span className="list-row-title">{entry.name}</span>
                      <span className="list-row-meta">{[entry.sizeBytes !== null && fileSize(entry.sizeBytes), formatMoment(entry.createdAt)].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                )}
                <span className="list-row-trail">
                  {entry.shared && (
                    <Badge icon="link" tone="muted">
                      Shared
                    </Badge>
                  )}
                  <ActionsMenu items={menu(entry)} name={entry.name} />
                </span>
              </li>
            ))}
          </ul>
        )}
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
