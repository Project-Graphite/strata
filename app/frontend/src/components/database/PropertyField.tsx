import type { ReactNode } from 'react';
import { Checkbox, DatePicker, formatDay, Popover, Select, TagChip } from '@project-graphite/ui';
import type { Property } from '../../notes';
import type { Member } from '../../spaces';
import { Hint } from '../Hint';
import { CommitInput } from '../CommitInput';
import { count } from '../../time';

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
      return count(Number(value));
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
  onChange: (value: unknown, expected: unknown) => Promise<boolean>;
  property: Property;
  value: unknown;
}) {
  if (!editable)
    return (
      <span className="flex min-w-0 flex-wrap gap-1 wrap-anywhere">
        {(property.type === 'checkbox' ? (value ? 'Yes' : null) : propertyDisplay(property, value, members)) ?? <span className="text-muted">—</span>}
      </span>
    );
  const label = property.name;
  switch (property.type) {
    case 'text':
    case 'number':
    case 'link':
      return (
        <CommitInput
          className="property-input"
          label={label}
          maxLength={2000}
          onCommit={(next, expected) => onChange(
            next === '' ? null : property.type === 'number' ? Number(next) : next,
            expected === '' ? null : property.type === 'number' ? Number(expected) : expected,
          )}
          type={property.type === 'number' ? 'number' : property.type === 'link' ? 'url' : 'text'}
          value={asText(value)}
        />
      );
    case 'date':
      return <DatePicker aria-label={label} className="w-full min-w-0" onChange={(day) => void onChange(day || null, value ?? null)} placeholder="—" quiet size="small" value={asText(value)} />;
    case 'checkbox':
      return <Checkbox aria-label={label} checked={value === true} onChange={(event) => void onChange(event.currentTarget.checked, value ?? null)} />;
    case 'select':
    case 'person':
      return (
        <Select
          aria-label={label}
          className="w-full min-w-0"
          onChange={(chosen) => void onChange(chosen || null, value ?? null)}
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
          trigger={<span className="flex flex-wrap gap-1">{chosen.length ? propertyDisplay(property, value, members) : <span className="text-muted">—</span>}</span>}
          triggerClassName="property-input text-left"
          triggerLabel={`Choose ${label}`}
        >
          {() => (
            <div className="grid gap-1 p-2">
              {property.options?.length ? (
                property.options.map((option) => (
                  <Checkbox
                    checked={chosen.includes(option.id)}
                    key={option.id}
                    label={option.name}
                    onChange={(event) => void onChange(event.currentTarget.checked ? [...chosen, option.id] : chosen.filter((id) => id !== option.id), value ?? null)}
                  />
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
