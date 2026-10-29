import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Dialog, Placeholder, type TagColor, TextLink } from '@project-graphite/ui';
import { entryLink, entryTime, entryWhen, kindLabels, type AgendaEntry, type CalendarEvent } from '../agenda';
import { pageScroller } from '../page-scroll';
import { repeatLabel } from '../tasks';
import { useResource } from '../useResource';
import { LoadError } from './LoadError';
import { Button, ButtonAnchor } from './Button';
import { DialogActions } from './DialogActions';
import { ButtonSkeleton, rowsOf, SkeletonLine, useRememberedShape } from './Skeletons';

export function CalendarEventDialog({ entry, onClose }: { entry: AgendaEntry; onClose: () => void }) {
  const details = useResource<CalendarEvent>(`/calendars/${entry.calendarId}/event?uid=${encodeURIComponent(entry.uid!)}`, true);
  const repeats = details.data?.repeatRule ? repeatLabel(details.data.repeatRule) : '';
  const [detailRows, meeting, described] = useRememberedShape(
    'calendar-event',
    details.data && [[repeats, details.data.location, details.data.organizer].filter(Boolean).length, Number(Boolean(details.data.meetingUrl)), Number(Boolean(details.data.description))],
    [1, 0, 0],
  );

  return (
    <Dialog eyebrow={entry.calendar} onClose={onClose} title={entry.title}>
      <p className="mt-2 mb-0 text-ink">{entryWhen(entry)}</p>
      {details.error ? (
        <div className="mt-4">
          <LoadError compact error={details.error} onRetry={details.reload} />
        </div>
      ) : !details.data ? (
        <Placeholder className="mt-4 grid gap-4" label="Loading the event">
          {detailRows > 0 && (
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {rowsOf(detailRows).map((row) => (
                <Fragment key={row}>
                  <SkeletonLine width="w-16" />
                  <SkeletonLine width={row % 2 ? 'w-32' : 'w-48'} />
                </Fragment>
              ))}
            </div>
          )}
          {meeting > 0 && <ButtonSkeleton large width="w-36" />}
          {described > 0 && (
            <div className="rounded-field border border-line p-3 text-sm">
              <SkeletonLine width="w-full" />
              <SkeletonLine width="w-2/3" />
            </div>
          )}
          <SkeletonLine className="text-sm" width="w-64 max-w-full" />
        </Placeholder>
      ) : (
        <div className="mt-4 grid gap-4">
          {(repeats || details.data.location || details.data.organizer) && (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {repeats && (
                <>
                  <dt className="text-faint">Repeats</dt>
                  <dd className="m-0 text-ink">{repeats === 'repeats' ? 'Custom schedule' : repeats[0]!.toUpperCase() + repeats.slice(1)}</dd>
                </>
              )}
              {details.data.location && (
                <>
                  <dt className="text-faint">Where</dt>
                  <dd className="m-0 whitespace-pre-line break-words text-ink">{details.data.location}</dd>
                </>
              )}
              {details.data.organizer && (
                <>
                  <dt className="text-faint">Organizer</dt>
                  <dd className="m-0 break-words text-ink">{details.data.organizer}</dd>
                </>
              )}
            </dl>
          )}
          {details.data.meetingUrl && (
            <ButtonAnchor href={details.data.meetingUrl} label="Join meeting" large primary />
          )}
          {details.data.description && (
            <p className="m-0 max-h-72 overflow-y-auto rounded-field border border-line p-3 text-sm whitespace-pre-line break-words text-muted">
              {details.data.description}
            </p>
          )}
          <p className="m-0 text-sm text-faint">
            From {details.data.calendar.name} · {details.data.calendar.host}.{' '}
            <TextLink href="/agenda/calendars">Manage calendars</TextLink>
          </p>
        </div>
      )}
      <div className="mt-5">
        <DialogActions>
          <Button label="Done" large onClick={onClose} primary />
        </DialogActions>
      </div>
    </Dialog>
  );
}

export function AgendaEntryLink({
  children,
  className,
  colour,
  entry,
  onOpen,
}: {
  children: ReactNode;
  className: string;
  colour: TagColor;
  entry: AgendaEntry;
  onOpen?: (target: HTMLElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const shared = { className: `${className} tag-${colour}`, style: { '--entry-color': 'var(--tag-color)' } as CSSProperties, title: entry.title };
  if (onOpen) {
    return (
      <button {...shared} onClick={(event) => onOpen(event.currentTarget)} type="button">
        {children}
      </button>
    );
  }
  if (entry.kind !== 'external') {
    return (
      <Link {...shared} to={entryLink(entry)}>
        {children}
      </Link>
    );
  }
  return (
    <>
      <button {...shared} onClick={() => setOpen(true)} type="button">
        {children}
      </button>
      {open && <CalendarEventDialog entry={entry} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AgendaCard({ colour, entry, onOpen }: { colour: TagColor; entry: AgendaEntry; onOpen?: (target: HTMLElement) => void }) {
  return (
    <AgendaEntryLink className="agenda-card" colour={colour} entry={entry} onOpen={onOpen}>
      <span className="block text-sm wrap-anywhere text-ink">{entry.title}</span>
      <span className="sr-only"> · </span>
      <span className="block text-small wrap-anywhere text-muted tabular-nums">
        <span className="whitespace-nowrap">{entryTime(entry)}</span>
        {' · '}
        {entry.calendar ?? kindLabels[entry.kind]}
        {entry.location && (
          <>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline">{entry.location}</span>
          </>
        )}
      </span>
    </AgendaEntryLink>
  );
}

export function EntryPeek({ anchor, entry, onClose, onEdit, onOpen }: { anchor: HTMLElement; entry: AgendaEntry; onClose: () => void; onEdit?: () => void; onOpen: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    const target = anchor.getBoundingClientRect();
    const own = panel.current!.getBoundingClientRect();
    const below = target.bottom + 6 + own.height <= window.innerHeight;
    setPlace({
      left: Math.max(16, Math.min(target.left, window.innerWidth - own.width - 16)),
      top: below ? target.bottom + 6 : Math.max(16, target.top - 6 - own.height),
    });
    panel.current!.querySelector('button')?.focus();
  }, [anchor]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
      if (event.type === 'scroll' && event.target !== document && event.target !== pageScroller()) return;
      onClose();
      anchor.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', close);
    window.addEventListener('scroll', close, { passive: true, capture: true });
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40" onClick={onClose} />
      <div aria-label={entry.title} className="fixed z-50 grid w-80 max-w-[calc(100vw-2rem)] gap-3 rounded-card border border-line bg-raised p-4 shadow-(--shadow-popover)" ref={panel} role="dialog" style={place}>
        <div className="grid gap-1">
          <p className="eyebrow m-0">{entry.calendar ?? kindLabels[entry.kind]}</p>
          <p className="m-0 text-h3 wrap-anywhere text-ink">{entry.title}</p>
          <p className="m-0 text-small text-muted">{entryWhen(entry)}</p>
          {entry.location && <p className="m-0 text-small wrap-anywhere text-muted">{entry.location}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {onEdit && <Button icon="pencil" label="Edit" onClick={onEdit} />}
          <Button label="Open" onClick={onOpen} primary />
        </div>
      </div>
    </>,
    document.body,
  );
}