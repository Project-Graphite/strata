import { useState } from 'react';
import { ConfirmDialog, EmptyState, isAbortError } from '@project-graphite/ui';
import { Choice, Suggestion } from '../components/TidyList';
import { fileSize } from '../files';
import { useAction } from '../useAction';

interface FileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
}

interface FolderHandle {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<FileHandle | FolderHandle>;
  removeEntry: (name: string) => Promise<void>;
  requestPermission: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
}

type FolderPicker = (options: { mode: 'read' }) => Promise<FolderHandle>;

interface LocalFile {
  path: string;
  size: number;
  modified: number;
  folder: FolderHandle;
  handle: FileHandle;
}

interface Report {
  duplicates: LocalFile[][];
  largest: LocalFile[];
  old: LocalFile[];
}

const maxFiles = 20_000;
const maxComparedBytes = 100 * 1024 * 1024;
const yearMs = 365 * 24 * 60 * 60 * 1000;

async function collect(folder: FolderHandle, prefix: string, found: LocalFile[], onProgress: (count: number) => void) {
  for await (const entry of folder.values()) {
    if (found.length >= maxFiles) return;
    if (entry.name.startsWith('.')) continue;
    if (entry.kind === 'directory') {
      await collect(entry, `${prefix}${entry.name}/`, found, onProgress);
    } else {
      const file = await entry.getFile();
      found.push({ path: `${prefix}${entry.name}`, size: file.size, modified: file.lastModified, folder, handle: entry });
      if (found.length % 250 === 0) onProgress(found.length);
    }
  }
}

function grouped(files: LocalFile[], key: (file: LocalFile) => string) {
  const groups = new Map<string, LocalFile[]>();
  for (const file of files) groups.set(key(file), [...(groups.get(key(file)) ?? []), file]);
  return [...groups.values()].filter((group) => group.length > 1);
}

async function contentKey(file: LocalFile) {
  const digest = await crypto.subtle.digest('SHA-256', await (await file.handle.getFile()).arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function analyse(files: LocalFile[]): Promise<Report> {
  const duplicates: LocalFile[][] = [];
  for (const sameSize of grouped(files.filter((file) => file.size > 0 && file.size <= maxComparedBytes), (file) => String(file.size))) {
    const keys = new Map<LocalFile, string>();
    for (const file of sameSize) keys.set(file, await contentKey(file));
    duplicates.push(...grouped(sameSize, (file) => keys.get(file)!).map((group) => group.sort((a, b) => a.modified - b.modified)));
  }
  return {
    duplicates: duplicates.sort((a, b) => (b.length - 1) * b[0]!.size - (a.length - 1) * a[0]!.size),
    largest: [...files].sort((a, b) => b.size - a.size).slice(0, 20),
    old: files
      .filter((file) => file.modified < Date.now() - yearMs)
      .sort((a, b) => a.modified - b.modified)
      .slice(0, 50),
  };
}

function without(report: Report, removed: ReadonlySet<string>): Report {
  const kept = (file: LocalFile) => !removed.has(file.path);
  return {
    duplicates: report.duplicates.map((group) => group.filter(kept)).filter((group) => group.length > 1),
    largest: report.largest.filter(kept),
    old: report.old.filter(kept),
  };
}

export function FolderScan() {
  const picker = (window as Window & { showDirectoryPicker?: FolderPicker }).showDirectoryPicker;
  const scanning = useAction();
  const [progress, setProgress] = useState(0);
  const [root, setRoot] = useState<FolderHandle>();
  const [report, setReport] = useState<Report>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  if (!picker) {
    return (
      <EmptyState title="Use Chrome or Edge on a computer">
        <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">This browser can’t open a folder for Strata to look through.</p>
      </EmptyState>
    );
  }

  const files = report ? [...report.duplicates.flat(), ...report.largest, ...report.old] : [];
  const chosen = [...new Map(files.filter((file) => selected.has(file.path)).map((file) => [file.path, file])).values()];
  const toggle = (path: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  const choice = (file: LocalFile, detail: string) => (
    <Choice checked={selected.has(file.path)} detail={detail} key={file.path} label={file.path} onToggle={() => toggle(file.path)} />
  );

  return (
    <div className="grid gap-10">
      <div className="grid gap-3">
        <p className="m-0 text-muted">
          Strata looks through a folder on this computer for duplicate, large and old files. Nothing is uploaded, and the results are gone when you
          leave this page.
        </p>
        <button
          className="primary-button inline-flex w-fit"
          disabled={scanning.busy}
          onClick={() =>
            void scanning.run(async () => {
              let folder: FolderHandle;
              try {
                folder = await picker({ mode: 'read' });
              } catch (reason) {
                if (isAbortError(reason)) return '';
                throw reason;
              }
              setReport(undefined);
              setSelected(new Set());
              setProgress(0);
              const found: LocalFile[] = [];
              await collect(folder, '', found, setProgress);
              setRoot(folder);
              setReport(await analyse(found));
              return `Looked at ${found.length} files in ${folder.name}.${
                found.length >= maxFiles ? ' Strata stops at 20,000 files, so choose a smaller folder to see everything.' : ''
              }`;
            }, 'Could not read the folder')
          }
          type="button"
        >
          {scanning.busy ? `Looking… ${progress} files so far` : 'Choose a folder'}
        </button>
        {scanning.status}
      </div>

      {report && (
        <>
          {report.duplicates.length > 0 && (
            <Suggestion
              action={
                <button
                  className="secondary-button px-3 py-2 text-sm"
                  onClick={() => setSelected(new Set([...selected, ...report.duplicates.flatMap((group) => group.slice(1).map((file) => file.path))]))}
                  type="button"
                >
                  Select the extra copies
                </button>
              }
              hint="Files with exactly the same content. The oldest copy comes first. Files over 100 MB are not compared."
              title="Duplicate files"
            >
              {report.duplicates.map((group) => (
                <div className="mt-4" key={group[0]!.path}>
                  <p className="mono-sm m-0 text-faint">
                    {group.length} copies of {fileSize(group[0]!.size)}
                  </p>
                  <ul className="m-0 grid list-none gap-0 p-0">
                    {group.map((file) => choice(file, `changed ${new Date(file.modified).toLocaleDateString()}`))}
                  </ul>
                </div>
              ))}
            </Suggestion>
          )}
          {report.largest.length > 0 && (
            <Suggestion hint="The biggest files in this folder." title="Largest files">
              <ul className="mt-3 grid list-none gap-0 p-0">{report.largest.map((file) => choice(file, fileSize(file.size)))}</ul>
            </Suggestion>
          )}
          {report.old.length > 0 && (
            <Suggestion hint="Files nobody has changed for over a year." title="Old files">
              <ul className="mt-3 grid list-none gap-0 p-0">
                {report.old.map((file) => choice(file, `unchanged since ${new Date(file.modified).toLocaleDateString()}`))}
              </ul>
            </Suggestion>
          )}
          {report.duplicates.length + report.largest.length + report.old.length === 0 && (
            <EmptyState title="Nothing to tidy">
              <p className="mx-auto mt-3 mb-0 max-w-md text-sm text-muted">This folder has no files to look at.</p>
            </EmptyState>
          )}
        </>
      )}

      {chosen.length > 0 && (
        <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <span className="mono-sm text-faint">
            {chosen.length} file{chosen.length === 1 ? '' : 's'} selected
          </span>
          <button className="secondary-button px-3 py-2 text-sm" onClick={() => setConfirming(true)} type="button">
            Delete from this computer
          </button>
          <button className="secondary-button px-3 py-2 text-sm" onClick={() => setSelected(new Set())} type="button">
            Clear
          </button>
        </div>
      )}

      {confirming && root && report && (
        <ConfirmDialog
          busyLabel="Deleting…"
          confirmLabel={`Delete ${chosen.length} file${chosen.length === 1 ? '' : 's'}`}
          errorFallback="Could not delete the files"
          eyebrow="delete files"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            if ((await root.requestPermission({ mode: 'readwrite' })) !== 'granted') {
              throw new Error('Strata was not allowed to change this folder.');
            }
            const removed = new Set<string>();
            try {
              for (const file of chosen) {
                await file.folder.removeEntry(file.handle.name);
                removed.add(file.path);
              }
            } finally {
              setReport((current) => current && without(current, removed));
              setSelected((current) => new Set([...current].filter((path) => !removed.has(path))));
            }
          }}
          title="Delete these files for good?"
        >
          <p className="m-0">They skip the recycle bin and can’t be brought back, not even from Strata’s undo history.</p>
          <ul className="m-0 grid max-h-48 list-none gap-1 overflow-y-auto p-0">
            {chosen.map((file) => (
              <li className="truncate text-ink" key={file.path}>
                {file.path}
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}
