import type { ReactNode } from 'react';
import { DatePicker, formatDay, Popover, Select, TagChip } from '@project-graphite/ui';
import type { Property } from '../../notes';
import type { Member } from '../../spaces';
import { Hint } from '../Hint';

const optionsOf = (property: Property, ids: unknown) =>
  (Array.isArray(ids) ? ids : [ids]).flatMap((id) => property.options?.filter((option) => option.id === id) ?? []);

const asText = (value: unknown) => (value === undefined || value === null ? '' : String(value));

export function propertyDisplay(property: Property, value: unknown, members: Member[] | undefined): ReactNode {
  if (value === undefined || value === null) return null;
  switch (property.type) {
    case 'select':
    case 'multiSelect':
      return optionsOf(property, value).map((option) => <TagChip color={option.color} key={option.id} label={option.name} />);
    case 'checkbox':
      return value ? property.name : null;
    case 'date':
      return formatDay(String(value), { day: 'numeric', month: 'short', year: 'numeric' });
    case 'person':
      return members ? (members.find((member) => member.userId === value)?.displayName ?? 'Former member') : null;
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
  members: Member[] | undefined;
  onChange: (value: unknown) => void;
  property: Property;
  value: unknown;
}) {
  if (!editable)
    return (
      <span className="flex flex-wrap gap-1">
        {(property.type === 'checkbox' ? (value ? 'Yes' : null) : propertyDisplay(property, value, members)) ?? <span className="text-faint">—</span>}
      </span>
    );
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
      return <DatePicker aria-label={label} onChange={(day) => onChange(day || null)} placeholder="—" quiet size="small" value={asText(value)} />;
    case 'checkbox':
      return <input aria-label={label} checked={value === true} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />;
    case 'select':
    case 'person':
      return (
        <Select
          aria-label={label}
          onChange={(chosen) => onChange(chosen || null)}
          options={[
            { value: '', label: '—' },
            ...(property.type === 'select'
              ? (property.options ?? []).map((option) => ({ value: option.id, label: option.name, leading: <span aria-hidden="true" className={`swatch-dot tag-${option.color}`} /> }))
              : (members ?? []).map((member) => ({ value: member.userId, label: member.displayName }))),
          ]}
          quiet
          size="small"
          value={asText(value)}
        />
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
                <Hint>Add options to this property first.</Hint>
              )}
            </div>
          )}
        </Popover>
      );
    }
  }
}
