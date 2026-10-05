import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon, ListSkeleton } from '@project-graphite/ui';
import { addDays, dayKey, monthDays } from '../../agenda';
import { useAuth } from '../../auth';
import { databaseViews, noteTitle, type DatabaseRow, type Note, type NoteDatabase, type Property, type PropertyValues } from '../../notes';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { LoadError } from '../LoadError';
import { PropertiesDialog } from './PropertiesDialog';
import { PropertyField, propertyDisplay, type Member } from './PropertyField';

const blank = (display: ReactNode) => display === null || (Array.isArray(display) && display.length === 0);

export function DatabaseView({ editable, noteId, spaceId }: { editable: boolean; noteId: string; spaceId: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const database = useResource<NoteDatabase>(`/notes/${noteId}/database`, true);
  const members = useResource<Member[]>(database.data?.properties.some((property) => property.type === 'person') ? `/spaces/${spaceId}/members` : null, true);
  const saving = useAction();
  const adding = useAction();
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(() => dayKey(new Date()));

  if (database.error) return <LoadError error={database.error} onRetry={database.reload} />;
  if (!database.data) return <ListSkeleton label="Loading the database" rows={4} />;
  const data = database.data;
  const people = members.data ?? [];
  const selects = data.properties.filter((property) => property.type === 'select');
  const dates = data.properties.filter((property) => property.type === 'date');
  const group = selects.find((property) => property.id === data.groupBy) ?? selects[0];
  const dateProperty = dates.find((property) => property.id === data.dateBy) ?? dates[0];

  function saveSchema(next: Partial<Omit<NoteDatabase, 'rows'>>) {
    if (!editable) {
      database.mutate((current) => ({ ...current, ...next }));
      return Promise.resolve(true);
    }
    return saving.run(async () => {
      const body = { properties: data.properties, view: data.view, groupBy: data.groupBy, dateBy: data.dateBy, ...next };
      const saved = await auth.request<NoteDatabase>(`/notes/${noteId}/database`, { method: 'PUT', body: JSON.stringify(body) });
      database.mutate(() => saved);
      return '';
    }, 'Could not change the database');
  }

  function setValues(rowId: string, values: PropertyValues) {
    void saving.run(async () => {
      const saved = await auth.request<{ values: PropertyValues }>(`/notes/${rowId}/properties`, { method: 'PATCH', body: JSON.stringify({ values }) });
      database.mutate((current) => ({ ...current, rows: current.rows.map((row) => (row.id === rowId ? { ...row, values: saved.values } : row)) }));
      return '';
    }, 'Could not save that');
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
        <span className="inline-flex flex-wrap items-center gap-1 text-xs text-muted" key={property.id}>
          {display}
        </span>
      ));

  const title = (row: DatabaseRow) => (
    <Link className="text-ink no-underline hover:underline" to={`/notes/${row.id}`}>
      {row.icon ? `${row.icon} ` : ''}
      {noteTitle(row)}
    </Link>
  );

  const chooser = (label: string, options: Property[], chosen: Property | undefined, key: 'groupBy' | 'dateBy') =>
    options.length > 1 && (
      <label className="flex items-center gap-2 text-sm text-muted">
        {label}
        <select className="text-sm" onChange={(event) => void saveSchema(key === 'groupBy' ? { groupBy: event.currentTarget.value } : { dateBy: event.currentTarget.value })} value={chosen?.id}>
          {options.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </label>
    );

  const empty = <p className="m-0 text-sm text-muted">No pages in this database yet.</p>;

  function body() {
    if (data.view === 'board') {
      if (!group) return <p className="m-0 text-sm text-muted">Add a select property to sort pages into columns.</p>;
      return (
        <>
          {chooser('Group by', selects, group, 'groupBy')}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[...(group.options ?? []), { id: '', name: `No ${group.name}` }].map((column) => {
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
                  <h3 className="m-0 flex items-center justify-between text-sm font-medium text-muted">
                    {column.name}
                    <span className="mono-sm text-faint">{cards.length}</span>
                  </h3>
                  {cards.map((card) => (
                    <article className="database-card" draggable={editable} key={card.id} onDragStart={(event) => event.dataTransfer.setData('text/plain', card.id)}>
                      {title(card)}
                      <div className="flex flex-wrap gap-2">{chips(card, group.id)}</div>
                    </article>
                  ))}
                  {editable && (
                    <button
                      className="text-button inline-flex w-fit items-center gap-1.5 text-sm"
                      disabled={adding.busy}
                      onClick={() => addRow(column.id ? { [group.id]: column.id } : {})}
                      type="button"
                    >
                      <Icon name="plus" size={14} />
                      New
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </>
      );
    }
    if (data.view === 'calendar') {
      if (!dateProperty) return <p className="m-0 text-sm text-muted">Add a date property to place pages on a calendar.</p>;
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
            <button className="secondary-button px-3 py-1.5 text-sm" onClick={() => shift(-1)} type="button">
              ← Earlier
            </button>
            <button className="secondary-button px-3 py-1.5 text-sm" onClick={() => shift(1)} type="button">
              Later →
            </button>
            <span className="mono-sm text-faint">{shown.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            {chooser('Dates from', dates, dateProperty, 'dateBy')}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {Array.from({ length: 7 }, (_, index) => addDays(from, index)).map((day) => (
              <p className="m-0 bg-paper px-2 py-1 text-xs text-faint" key={`head-${day}`}>
                {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
            ))}
            {Array.from({ length: days }, (_, index) => addDays(from, index)).map((day) => (
              <div
                aria-label={new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
                className={`grid min-h-20 content-start gap-0.5 bg-paper p-1.5 ${new Date(`${day}T00:00:00`).getMonth() !== shown.getMonth() ? 'opacity-50' : ''}`}
                key={day}
                role="group"
              >
                <div className="flex items-center justify-between">
                  <span className={`mono-sm ${day === today ? 'font-medium text-ink' : 'text-faint'}`}>{new Date(`${day}T00:00:00`).getDate()}</span>
                  {editable && (
                    <button aria-label="Add a page on this day" className="text-button text-faint" disabled={adding.busy} onClick={() => addRow({ [dateProperty.id]: day })} type="button">
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                </div>
                {(byDay.get(day) ?? []).map((row) => (
                  <span className="block truncate text-xs" key={row.id}>
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
        <ul className="m-0 grid list-none gap-1.5 p-0">
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
                      onChange={(value) => setValues(row.id, { [property.id]: value })}
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
    <section aria-label="Database" className="grid gap-4 border-t border-line-soft pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div aria-label="Database view" className="flex gap-4" role="group">
          {databaseViews.map(([view, label]) => (
            <button aria-pressed={data.view === view} className={`tab-link ${data.view === view ? 'active' : ''}`} key={view} onClick={() => void saveSchema({ view })} type="button">
              {label}
            </button>
          ))}
        </div>
        {editable && (
          <div className="flex items-center gap-4">
            <button className="text-button text-sm" onClick={() => setEditing(true)} type="button">
              Properties
            </button>
            <button className="secondary-button px-3 py-1.5 text-sm" disabled={adding.busy} onClick={() => addRow()} type="button">
              <Icon name="plus" size={14} />
              New page
            </button>
          </div>
        )}
      </div>
      {body()}
      {editing && (
        <PropertiesDialog
          busy={saving.busy}
          onClose={() => setEditing(false)}
          onSave={(properties) =>
            void saveSchema({
              properties,
              groupBy: properties.some((property) => property.id === data.groupBy && property.type === 'select') ? data.groupBy : null,
              dateBy: properties.some((property) => property.id === data.dateBy && property.type === 'date') ? data.dateBy : null,
            }).then((saved) => saved && setEditing(false))
          }
          properties={data.properties}
        />
      )}
    </section>
  );
}
