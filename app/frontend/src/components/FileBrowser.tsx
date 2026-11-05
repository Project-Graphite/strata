import { Fragment, lazy, Suspense, useRef, useState, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react';
import { Dialog, Icon, IconButton, type IconName } from '@project-graphite/ui';
import { FilePreview, fileSize, previewable } from '../files';
import { formatMoment } from '../time';
import { ActionsMenu } from './ActionsMenu';
import { Button } from './Button';
import { CrashBoundary } from './CrashBoundary';
import { DialogActions } from './DialogActions';
import { FilterMenu, type FilterGroup } from './FilterMenu';
import { Hint } from './Hint';
import { ContextMenu, NestedMenu, type NestedMenuItem } from './NestedMenu';

const PdfViewer = lazy(() => import('./PdfViewer'));

export interface BrowserEntry {
  id: string;
  kind: 'folder' | 'file';
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  updatedAt: string | null;
  shared?: boolean;
  detail?: string | null;
}

export interface BrowserSort {
  key: 'name' | 'updatedAt' | 'sizeBytes';
  descending: boolean;
}

export type BrowserAction = NestedMenuItem & { icon?: IconName };

const columns = { name: 'Name', updatedAt: 'Last modified', sizeBytes: 'File size' } as const;
const directions = { name: ['A to Z', 'Z to A'], updatedAt: ['Oldest first', 'Newest first'], sizeBytes: ['Smallest first', 'Largest first'] } as const;
const sortKeys = Object.keys(columns) as BrowserSort['key'][];
const contained = { onClick: (event: SyntheticEvent) => event.stopPropagation(), onDoubleClick: (event: SyntheticEvent) => event.stopPropagation(), onKeyDown: (event: SyntheticEvent) => event.stopPropagation() };

export const sortGroups = (sort: BrowserSort, onSort: (sort: BrowserSort) => void): FilterGroup[] => [
  { label: 'Sort by', options: sortKeys.map((key) => ({ label: columns[key], active: sort.key === key, onSelect: () => onSort({ key, descending: key !== 'name' }) })) },
  { label: 'Order', options: directions[sort.key].map((label, index) => ({ label, active: sort.descending === (index === 1), onSelect: () => onSort({ ...sort, descending: index === 1 }) })) },
];

export function compareEntries(sort: BrowserSort) {
  return (a: BrowserEntry, b: BrowserEntry) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    if (sort.key === 'updatedAt' && (!a.updatedAt || !b.updatedAt)) return a.updatedAt === b.updatedAt ? a.name.localeCompare(b.name) : a.updatedAt ? -1 : 1;
    const order =
      sort.key === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : sort.key === 'updatedAt' ? a.updatedAt!.localeCompare(b.updatedAt!) : (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0);
    return sort.descending ? -order : order;
  };
}

function Preview({ entry, onClose, onDownload }: { entry: BrowserEntry; onClose: () => void; onDownload: () => void }) {
  return (
    <Dialog onClose={onClose} title={entry.name}>
      <div className="mt-5 grid gap-4">
        <CrashBoundary compact label="The preview">
        {entry.mimeType === 'application/pdf' ? (
          <Suspense fallback={<span aria-hidden="true" className="skeleton block h-64 w-full" />}>
            <PdfViewer fileId={entry.id} name={entry.name} />
          </Suspense>
        ) : entry.mimeType && previewable(entry.mimeType) ? (
          <FilePreview className="drive-preview" item={entry} />
        ) : (
          <Hint>There is no preview for this kind of file. Download it to open it.</Hint>
        )}
        </CrashBoundary>
        <DialogActions>
          <Button icon="download" label="Download" large onClick={onDownload} primary />
        </DialogActions>
      </div>
    </Dialog>
  );
}

export function FileBrowser<T extends BrowserEntry>({
  backgroundMenu,
  idle,
  label,
  menu,
  onDelete,
  onDownload,
  onOpenFolder,
  onSort,
  rowProps,
  sections,
  sort,
}: {
  backgroundMenu?: NestedMenuItem[];
  idle?: ReactNode;
  label: string;
  menu: (selection: T[]) => BrowserAction[];
  onDelete?: (selection: T[]) => void;
  onDownload: (files: T[]) => void;
  onOpenFolder?: (folder: T) => void;
  onSort: (sort: BrowserSort) => void;
  rowProps?: (entry: T, selection: T[]) => HTMLAttributes<HTMLLIElement> & { 'data-over'?: boolean };
  sections: { key: string; heading?: ReactNode; entries: T[]; empty?: ReactNode }[];
  sort: BrowserSort;
}) {
  const area = useRef<HTMLDivElement>(null);
  const anchor = useRef<string>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number }>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: NestedMenuItem[] }>();
  const [preview, setPreview] = useState<T>();
  const ordered = sections.map((section) => ({ ...section, entries: [...section.entries].sort(compareEntries(sort)) }));
  const flat = ordered.flatMap((section) => section.entries);
  const chosen = flat.filter((entry) => selected.has(entry.id));

  const open = (entry: T) => (entry.kind === 'folder' ? onOpenFolder?.(entry) : setPreview(entry));
  const actions = (selection: T[]): BrowserAction[] => [...(selection.length === 1 ? [{ label: 'Open', onSelect: () => open(selection[0]!) }] : []), ...menu(selection)];

  function select(ids: string[], from?: T) {
    setSelected(new Set(ids));
    anchor.current = from?.id;
  }

  function extend(entry: T, keep: boolean) {
    const start = flat.findIndex((candidate) => candidate.id === anchor.current);
    if (start < 0) return select([entry.id], entry);
    const end = flat.indexOf(entry);
    const ids = flat.slice(Math.min(start, end), Math.max(start, end) + 1).map((ranged) => ranged.id);
    setSelected((current) => new Set(keep ? [...current, ...ids] : ids));
  }

  function toggle(entry: T) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(entry.id)) next.add(entry.id);
      return next;
    });
    anchor.current = entry.id;
  }

  function click(entry: T, event: MouseEvent) {
    const touch = (event.nativeEvent as globalThis.PointerEvent).pointerType === 'touch';
    if (touch && selected.size === 0) open(entry);
    else if (event.shiftKey) extend(entry, event.ctrlKey || event.metaKey);
    else if (event.ctrlKey || event.metaKey || touch) toggle(entry);
    else select([entry.id], entry);
  }

  function step(entry: T, offset: number, event: KeyboardEvent) {
    const next = flat[flat.indexOf(entry) + offset];
    if (!next) return;
    event.preventDefault();
    area.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
    if (event.shiftKey) extend(next, false);
    else select([next.id], next);
  }

  function marquee(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as Element;
    const element = area.current!;
    if (event.button !== 0 || event.pointerType !== 'mouse' || !element.contains(target) || target.closest('.drive-row, .drive-bar, .drive-head, a, button, input, summary')) return;
    event.preventDefault();
    element.focus();
    const base = event.ctrlKey || event.metaKey || event.shiftKey ? [...selected] : [];
    const start = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY };
    let moved = false;
    const move = (pointer: globalThis.PointerEvent) => {
      const end = { x: pointer.clientX + window.scrollX, y: pointer.clientY + window.scrollY };
      if (!moved && Math.hypot(end.x - start.x, end.y - start.y) < 4) return;
      moved = true;
      const left = Math.min(start.x, end.x) - window.scrollX;
      const top = Math.min(start.y, end.y) - window.scrollY;
      const right = Math.max(start.x, end.x) - window.scrollX;
      const bottom = Math.max(start.y, end.y) - window.scrollY;
      const bounds = element.getBoundingClientRect();
      setBox({ left: left - bounds.left, top: top - bounds.top, width: right - left, height: bottom - top });
      const hits = [...element.querySelectorAll<HTMLElement>('.drive-row')].filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.width > 0 && rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top;
      });
      setSelected(new Set([...base, ...hits.map((row) => row.dataset.id!)]));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      setBox(undefined);
      if (!moved) select(base);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  const quick = actions(chosen).filter((action): action is BrowserAction & { icon: IconName; onSelect: () => void } => Boolean(action.icon) && 'onSelect' in action);

  return (
    <>
      <div
        aria-label={label}
        className="drive-browser"
        onContextMenu={(event) => {
          if (!backgroundMenu || (event.target as Element).closest('.drive-bar')) return;
          event.preventDefault();
          select([]);
          setContextMenu({ x: event.clientX, y: event.clientY, items: backgroundMenu });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') select([]);
          else if (event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            setSelected(new Set(flat.map((entry) => entry.id)));
          } else if ((event.key === 'Delete' || event.key === 'Backspace') && chosen.length > 0 && onDelete) {
            event.preventDefault();
            onDelete(chosen);
          }
        }}
        onPointerDown={marquee}
        ref={area}
        role="region"
        tabIndex={-1}
      >
        <div className="drive-bar" {...contained}>
          {chosen.length > 0 ? (
            <div aria-label="Selection" className="drive-selection" role="toolbar">
              <IconButton icon="x" label="Clear the selection" onClick={() => select([])} />
              <span className="drive-count">{chosen.length} selected</span>
              {quick.map((action) => (
                <IconButton icon={action.icon} key={action.label} label={action.label} onClick={action.onSelect} />
              ))}
              <NestedMenu items={actions(chosen)} label="Selection actions" trigger={<Icon name="more" size={18} />} triggerLabel="More actions" />
            </div>
          ) : (
            idle
          )}
        </div>
        {flat.length > 0 && (
          <div className="drive-head">
            {sortKeys.map((key) => (
              <button className="drive-sort" data-active={sort.key === key || undefined} key={key} onClick={() => onSort({ key, descending: sort.key === key ? !sort.descending : key !== 'name' })} type="button">
                {columns[key]}
                {sort.key === key && <Icon name={sort.descending ? 'chevron-down' : 'chevron-up'} size={14} />}
              </button>
            ))}
            <div className="drive-narrow">
              <FilterMenu groups={sortGroups(sort, onSort)} label="Sort" />
            </div>
          </div>
        )}
        {ordered.map((section) => {
          const rows =
            section.entries.length === 0 ? (
              section.empty
            ) : (
              <ul aria-label={label} aria-multiselectable="true" className="panel-rows" role="listbox">
                {section.entries.map((entry) => (
                  <li
                    aria-selected={selected.has(entry.id)}
                    className="drive-row"
                    data-id={entry.id}
                    key={entry.id}
                    onClick={(event) => click(entry, event)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const selection = selected.has(entry.id) ? chosen : [entry];
                      if (!selected.has(entry.id)) select([entry.id], entry);
                      setContextMenu({ x: event.clientX, y: event.clientY, items: actions(selection) });
                    }}
                    onDoubleClick={() => open(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') open(entry);
                      else if (event.key === ' ') {
                        event.preventDefault();
                        toggle(entry);
                      } else if (event.key === 'ArrowDown') step(entry, 1, event);
                      else if (event.key === 'ArrowUp') step(entry, -1, event);
                    }}
                    role="option"
                    tabIndex={0}
                    {...rowProps?.(entry, chosen)}
                  >
                    <span className="drive-name">
                      <span className="drive-icon">
                        {entry.kind === 'folder' ? <Icon name="folder" size={18} /> : entry.mimeType && previewable(entry.mimeType) ? <FilePreview item={entry} /> : <Icon name="file" size={18} />}
                      </span>
                      <span className="list-row-text">
                        <span className="list-row-title">
                          {entry.name}
                          {entry.shared && (
                            <span className="drive-shared" title="Shared by link">
                              <Icon name="users" size={14} />
                            </span>
                          )}
                        </span>
                        {entry.detail && <span className="list-row-meta">{entry.detail}</span>}
                        <span className="list-row-meta drive-narrow">{[entry.updatedAt && formatMoment(entry.updatedAt), entry.sizeBytes !== null && fileSize(entry.sizeBytes)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                    <span className="drive-cell">{formatMoment(entry.updatedAt)}</span>
                    <span className="drive-cell">{entry.sizeBytes === null ? '—' : fileSize(entry.sizeBytes)}</span>
                    <span className="drive-trail" {...contained}>
                      <ActionsMenu items={actions([entry])} name={entry.name} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          return section.heading ? (
            <details className="files-group" key={section.key} open={section.entries.length > 0}>
              <summary>{section.heading}</summary>
              {rows}
            </details>
          ) : (
            <Fragment key={section.key}>{rows}</Fragment>
          );
        })}
        {box && <span className="drive-marquee" style={box} />}
      </div>
      {contextMenu && <ContextMenu at={contextMenu} items={contextMenu.items} label="Actions" onClose={() => setContextMenu(undefined)} />}
      {preview && <Preview entry={preview} onClose={() => setPreview(undefined)} onDownload={() => onDownload([preview])} />}
    </>
  );
}
