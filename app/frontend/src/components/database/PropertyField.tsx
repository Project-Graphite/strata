import type { ReactNode } from 'react';
import { Popover, TagChip } from '@project-graphite/ui';
import type { Property } from '../../notes';
import type { Member } from '../../spaces';

const optionsOf = (property: Property, ids: unknown) =>
  (Array.isArray(ids) ? ids : [ids]).flatMap((id) => property.options?.filter((option) => option.id === id) ?? []);

const asText = (value: unknown) => (value === undefined || value === null ? '' : String(value));

export function propertyDisplay(property: Property, value: unknown, members: Member[]): ReactNode {
  if (value === undefined || value === null) return null;
  switch (property.type) {
    case 'select':
    case 'multiSelect':
      return optionsOf(property, value).map((option) => <TagChip color={option.color} key={option.id} label={option.name} />);
    case 'checkbox':
      return value ? property.name : null;
    case 'date':
      return new Date(`${String(value)}T00:00:00`).toLocaleDateString();
    case 'person':
      return members.find((member) => member.userId === value)?.displayName ?? 'Former member';
    case 'link':
      return (
        <a href={String(value)} rel="noopener noreferrer" target="_blank">
          {new URL(String(value)).hostname}
        </a>
      );
    case 'number':
      return Number(value).toLocaleString();
    default:
      return String(value);
  }
}

export function PropertyField({
  editable,
  members,
  onChange,
  property,
  value,
}: {
  editable: boolean;
  members: Member[];
  onChange: (value: unknown) => void;
  property: Property;
  value: unknown;
}) {
  if (!editable) return <span className="flex flex-wrap gap-1">{propertyDisplay(property, value, members) ?? <span className="text-faint">—</span>}</span>;
  const label = property.name;
  switch (property.type) {
    case 'text':
    case 'number':
    case 'link':
      return (
        <input
          aria-label={label}
          className="property-input"
          defaultValue={asText(value)}
          key={asText(value)}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (next === asText(value)) return;
            onChange(next === '' ? null : property.type === 'number' ? Number(next) : next);
          }}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          type={property.type === 'number' ? 'number' : property.type === 'link' ? 'url' : 'text'}
        />
      );
    case 'date':
      return <input aria-label={label} className="property-input" onChange={(event) => onChange(event.currentTarget.value || null)} type="date" value={asText(value)} />;
    case 'checkbox':
      return <input aria-label={label} checked={value === true} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />;
    case 'select':
    case 'person':
      return (
        <select aria-label={label} className="property-input" onChange={(event) => onChange(event.currentTarget.value || null)} value={asText(value)}>
          <option value="">—</option>
          {property.type === 'select'
            ? property.options?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))
            : members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
        </select>
      );
    case 'multiSelect': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Popover
          label={label}
          trigger={<span className="flex flex-wrap gap-1">{chosen.length ? propertyDisplay(property, value, members) : <span className="text-faint">—</span>}</span>}
          triggerClassName="property-input text-left"
          triggerLabel={`Choose ${label}`}
        >
          {() => (
            <div className="grid gap-1 p-2">
              {property.options?.length ? (
                property.options.map((option) => (
                  <label className="flex items-center gap-2 text-sm" key={option.id}>
                    <input
                      checked={chosen.includes(option.id)}
                      onChange={(event) => onChange(event.currentTarget.checked ? [...chosen, option.id] : chosen.filter((id) => id !== option.id))}
                      type="checkbox"
                    />
                    {option.name}
                  </label>
                ))
              ) : (
                <p className="m-0 text-sm text-muted">Add options to this property first.</p>
              )}
            </div>
          )}
        </Popover>
      );
    }
  }
}
