import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDay, IconButton, Placeholder, SegmentedControl, Select, Skeleton } from '@project-graphite/ui';
import { addDays, dayKey, monthDays } from '../../agenda';
import { useAuth } from '../../auth';
import { databaseViews, noteHref, noteTitle, type DatabaseRow, type Note, type NoteDatabase, type Property, type PropertyValues } from '../../notes';
import type { Member } from '../../spaces';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { LoadError } from '../LoadError';
import { PropertiesDialog } from './PropertiesDialog';
import { PropertyField, propertyDisplay } from './PropertyField';
import { PeriodNav } from '../PeriodNav';
import { Hint } from '../Hint';
import { Button, TextButton } from '../Button';
import { ActionsMenu } from '../ActionsMenu';
import { ButtonSkeleton, HintSkeleton, rowsOf, SkeletonLine, useRememberedShape } from '../Skeletons';

const blank = (display: ReactNode) => display === null || (Array.isArray(display) && display.length === 0);

export function DatabaseView({ editable, noteId, spaceId }: { editable: boolean; noteId: string; spaceId: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const database = useResource<NoteDatabase>(`/notes/${noteId}/database`, true, { live: ['page-databases', 'page-details', 'items', 'spaces'], spaceId });
  const members = useResource<Member[]>(database.data?.properties.some((property) => property.type === 'person') ? `/spaces/${spaceId}/members` : null, true);
  const saving = useAction();
  const adding = useAction();
  const [editing, setEditing] = useState<NoteDatabase>();
  const [month, setMonth] = useState(() => dayKey(new Date()));
  const [rows, columns] = useRememberedShape(`database-${noteId}`, database.data && [database.data.rows.length, database.data.properties.length], [3, 2]);

  if (database.error) return <LoadError error={database.error} onRetry={database.reload} />;
  if (!database.data) {
    return (
      <Placeholder className="grid gap-4 border-t border-line-soft pt-6" label="Loading the database">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-[2.421875rem] w-64 rounded-field" />
          {editable && (
            <div className="flex items-center gap-4">
              <ButtonSkeleton width="w-28" />
              <ButtonSkeleton width="w-24" />
            </div>
          )}
        </div>
        {rows ? (
          <table aria-hidden="true" className="database-table">
            <tbody>
              {rowsOf(rows + 1).map((row) => (
                <tr key={row}>
                  <th>
                    <SkeletonLine width={row ? 'w-32' : 'w-12'} />
                  </th>
                  {rowsOf(columns).map((column) => (
                    <td key={column}>
                      <SkeletonLine width={column % 2 ? 'w-20' : 'w-16'} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <HintSkeleton />
        )}
      </Placeholder>
    );
  }
  const data = database.data;
  const people = members.data;
  const selects = data.properties.filter((property) => property.type === 'select');
  const dates = data.properties.filter((property) => property.type === 'date');
  const group = selects.find((property) => property.id === data.groupBy) ?? selects[0];
  const dateProperty = dates.find((property) => property.id === data.dateBy) ?? dates[0];

  function saveSchema(next: Partial<Omit<NoteDatabase, 'rows' | 'revision'>>, done = '', base = data) {
    if (!editable) {
      database.mutate((current) => ({ ...current, ...next }));
      return Promise.resolve(true);
    }
    return saving.run(async () => {
      const body = { properties: base.properties, view: base.view, groupBy: base.groupBy, dateBy: base.dateBy, expectedRevision: base.revision, ...next };
      const saved = await auth.request<NoteDatabase>(`/notes/${noteId}/database`, { method: 'PUT', body: JSON.stringify(body) });
      database.mutate(() => saved);
      return done;
    }, 'Could not change the database').then((saved) => {
      if (!saved) database.reload();
      return saved;
    });
  }

  function setValues(rowId: string, values: PropertyValues, expectedValues: PropertyValues = Object.fromEntries(Object.keys(values).map((id) => [id, data.rows.find((row) => row.id === rowId)?.values[id] ?? null]))) {
    return saving.run(async () => {
      const saved = await auth.request<{ values: PropertyValues }>(`/notes/${rowId}/properties`, { method: 'PATCH', body: JSON.stringify({ values, expectedValues }) });
      database.mutate((current) => ({ ...current, rows: current.rows.map((row) => (row.id === rowId ? { ...row, values: saved.values } : row)) }));
      return '';
    }, 'Could not save that').then((saved) => {
      if (!saved) database.reload();
      return saved;
    });
  }

  function addRow(values: PropertyValues = {}) {
    void adding.run(async () => {
      const created = await auth.request<Note>(`/spaces/${spaceId}/notes`, { method: 'POST', body: JSON.stringify({ parentId: noteId }) });
      if (Object.keys(values).length) await auth.request(`/notes/${created.id}/properties`, { method: 'PATCH', body: JSON.stringify({ values }) });
      navigate(`/notes/${created.id}`);
      return '';
    }, 'Could not add the page');
  }

  const chips = (row: DatabaseRow, skip?: string) =>
    data.properties
      .filter((property) => property.id !== skip)
      .map((property) => [property, propertyDisplay(property, row.values[property.id], people)] as const)
      .filter(([, display]) => !blank(display))
      .slice(0, 3)
      .map(([property, display]) => (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1 wrap-anywhere text-small text-muted" key={property.id}>
          {display}
        </span>
      ));

  const title = (row: DatabaseRow) => (
    <Link className="min-w-0 wrap-anywhere text-ink no-underline hover:underline" to={noteHref(row)}>
      {row.icon ? `${row.icon} ` : ''}
      {noteTitle(row)}
    </Link>
  );

  const chooser = (label: string, options: Property[], chosen: Property | undefined, key: 'groupBy' | 'dateBy') =>
    options.length > 1 && (
      <div className="flex items-center gap-2 text-small text-muted">
        {label}
        <Select
          aria-label={label}
          onChange={(id) => void saveSchema(key === 'groupBy' ? { groupBy: id } : { dateBy: id })}
          options={options.map((property) => ({ value: property.id, label: property.name }))}
          size="small"
          value={chosen?.id ?? ''}
        />
      </div>
    );

  const empty = <Hint>No pages in this database yet.</Hint>;

  function body() {
    if (data.view === 'board') {
      if (!group) return <Hint>Add a select property to sort pages into columns.</Hint>;
      const columns = [...(group.options ?? []), { id: '', name: `No ${group.name}` }];
      return (
        <>
          {chooser('Group by', selects, group, 'groupBy')}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map((column) => {
              const cards = data.rows.filter((row) => (row.values[group.id] ?? '') === column.id);
              return (
                <section
                  aria-label={column.name}
                  className="database-column"
                  key={column.id}
                  onDragOver={(event) => editable && event.preventDefault()}
                  onDrop={(event) => {
                    const row = data.rows.find((candidate) => candidate.id === event.dataTransfer.getData('text/plain'));
                    if (row && (row.values[group.id] ?? '') !== column.id) setValues(row.id, { [group.id]: column.id || null });
                  }}
                >
                  <h3 className="m-0 flex items-center justify-between text-h3 text-muted">
                    {column.name}
                    <span className="mono-sm text-faint">{cards.length}</span>
                  </h3>
                  {cards.map((card) => (
                    <article className="database-card" draggable={editable} key={card.id} onDragStart={(event) => event.dataTransfer.setData('text/plain', card.id)}>
                      <div className="flex items-start justify-between gap-2">
                        {title(card)}
                        {editable && (
                          <ActionsMenu
                            items={columns
                              .filter((other) => other.id !== column.id)
                              .map((other) => ({ label: `Move to ${other.name}`, onSelect: () => setValues(card.id, { [group.id]: other.id || null }) }))}
                            name={noteTitle(card)}
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">{chips(card, group.id)}</div>
                    </article>
                  ))}
                  {editable && (
                    <TextButton disabled={adding.busy} icon="plus" label="New" onClick={() => addRow(column.id ? { [group.id]: column.id } : {})} />
                  )}
                </section>
              );
            })}
          </div>
        </>
      );
    }
    if (data.view === 'calendar') {
      if (!dateProperty) return <Hint>Add a date property to place pages on a calendar.</Hint>;
      const { from, days } = monthDays(month);
      const shown = new Date(`${month}T00:00:00`);
      const shift = (direction: number) => setMonth(dayKey(new Date(shown.getFullYear(), shown.getMonth() + direction, 1)));
      const byDay = new Map<string, DatabaseRow[]>();
      for (const row of data.rows) {
        const day = row.values[dateProperty.id];
        if (typeof day === 'string') byDay.set(day, [...(byDay.get(day) ?? []), row]);
      }
      const undated = data.rows.filter((row) => typeof row.values[dateProperty.id] !== 'string');
      const today = dayKey(new Date());
      return (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodNav onShift={shift} title={formatDay(dayKey(shown), { month: 'long', year: 'numeric' })} unit="month" />
            {chooser('Dates from', dates, dateProperty, 'dateBy')}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-panel border border-line bg-line">
            {Array.from({ length: 7 }, (_, index) => addDays(from, index)).map((day) => (
              <p className="m-0 bg-paper px-2 py-1 text-xs text-faint" key={`head-${day}`}>
                {formatDay(day, { weekday: 'short' })}
              </p>
            ))}
            {Array.from({ length: days }, (_, index) => addDays(from, index)).map((day) => (
              <div
                aria-label={formatDay(day, { day: 'numeric', month: 'long' })}
                className={`grid min-h-20 min-w-0 content-start gap-0.5 bg-paper p-1.5 ${new Date(`${day}T00:00:00`).getMonth() !== shown.getMonth() ? 'opacity-50' : ''}`}
                key={day}
                role="group"
              >
                <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between">
                  <span className={`mono-sm ${day === today ? 'font-medium text-ink' : 'text-faint'}`}>{new Date(`${day}T00:00:00`).getDate()}</span>
                  {editable && (
                    <IconButton className="max-sm:min-h-10" disabled={adding.busy} icon="plus" label="Add a page on this day" onClick={() => addRow({ [dateProperty.id]: day })} size="small" />
                  )}
                </div>
                {(byDay.get(day) ?? []).map((row) => (
                  <span className="block truncate text-sm" key={row.id}>
                    {title(row)}
                  </span>
                ))}
              </div>
            ))}
          </div>
          {undated.length > 0 && (
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <span className="text-muted">No date:</span>
              {undated.map((row) => (
                <span key={row.id}>{title(row)}</span>
              ))}
            </p>
          )}
        </>
      );
    }
    if (data.rows.length === 0) return empty;
    if (data.view === 'list') {
      return (
        <ul className="m-0 grid min-w-0 grid-cols-1 list-none gap-1.5 p-0">
          {data.rows.map((row) => (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1" key={row.id}>
              {title(row)}
              {chips(row)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="database-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              {data.properties.map((property) => (
                <th key={property.id} scope="col">
                  {property.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{title(row)}</th>
                {data.properties.map((property) => (
                  <td key={property.id}>
                    <PropertyField
                      editable={editable}
                      members={people}
                      onChange={(value, expected) => setValues(row.id, { [property.id]: value }, { [property.id]: expected })}
                      property={property}
                      value={row.values[property.id]}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section aria-label="Database" className="grid min-w-0 grid-cols-1 gap-4 border-t border-line-soft pt-6">
      {database.refreshError && <LoadError compact error={database.refreshError} onRetry={database.reload} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Database view"
          onChange={(view) => void saveSchema({ view })}
          options={databaseViews.map(([value, label]) => ({ label, value }))}
          value={data.view}
        />
        {editable && (
          <div className="flex items-center gap-4">
            <TextButton label="Edit properties" onClick={() => setEditing(data)} />
            <Button disabled={adding.busy} icon="plus" label="New page" onClick={() => addRow()} />
          </div>
        )}
      </div>
      {body()}
      {editing && (
        <PropertiesDialog
          busy={saving.busy}
          onClose={() => setEditing(undefined)}
          onSave={(properties) =>
            void saveSchema(
              {
                properties,
                groupBy: properties.some((property) => property.id === editing.groupBy && property.type === 'select') ? editing.groupBy : null,
                dateBy: properties.some((property) => property.id === editing.dateBy && property.type === 'date') ? editing.dateBy : null,
              },
              'Saved the properties.',
              editing,
            ).then((saved) => saved && setEditing(undefined))
          }
          properties={editing.properties}
          conflicted={editing.revision !== data.revision}
        />
      )}
    </section>
  );
}
