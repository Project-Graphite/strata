import { useState } from 'react';
import { Icon, Select, tagColors } from '@project-graphite/ui';
import { FormDialog } from '../FormDialog';
import { propertyTypes, type Property, type PropertyType } from '../../notes';
import { colorOptions } from '../../spaces';
import { Hint } from '../Hint';

const hasOptions = (type: PropertyType) => type === 'select' || type === 'multiSelect';

export function PropertiesDialog({
  busy,
  onClose,
  onSave,
  properties,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (properties: Property[]) => void;
  properties: Property[];
}) {
  const [draft, setDraft] = useState(properties);
  const change = (id: string, next: Partial<Property>) => setDraft((current) => current.map((property) => (property.id === id ? { ...property, ...next } : property)));

  return (
    <FormDialog
      busy={busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={() =>
        onSave(
          draft
            .map((property) => ({ ...property, name: property.name.trim() || 'Untitled' }))
            .map(({ options, ...property }) =>
              hasOptions(property.type) ? { ...property, options: (options ?? []).filter((option) => option.name.trim()).map((option) => ({ ...option, name: option.name.trim() })) } : property,
            ),
        )
      }
      submitLabel="Save properties"
      title="Properties"
    >
      {draft.length === 0 && <Hint>Pages in this database have no properties yet.</Hint>}
      <ul className="m-0 grid list-none gap-4 p-0">
        {draft.map((property) => (
          <li className="grid gap-2" key={property.id}>
            <div className="flex items-center gap-2">
              <input
                aria-label="Property name"
                className="min-w-0 flex-1"
                maxLength={60}
                onChange={(event) => change(property.id, { name: event.currentTarget.value })}
                value={property.name}
              />
              <Select
                aria-label={`Kind of ${property.name || 'property'}`}
                className="w-40"
                onChange={(type: PropertyType) => change(property.id, { type })}
                options={propertyTypes.map(([value, label]) => ({ value, label }))}
                value={property.type}
              />
              <button
                aria-label={`Remove ${property.name || 'property'}`}
                className="text-button"
                onClick={() => setDraft((current) => current.filter((candidate) => candidate.id !== property.id))}
                type="button"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            {hasOptions(property.type) && (
              <div className="ml-4 grid gap-1.5">
                {(property.options ?? []).map((option) => (
                  <div className="flex items-center gap-2" key={option.id}>
                    <input
                      aria-label="Option name"
                      className="min-w-0 flex-1 text-sm"
                      maxLength={60}
                      onChange={(event) =>
                        change(property.id, {
                          options: property.options?.map((candidate) => (candidate.id === option.id ? { ...candidate, name: event.currentTarget.value } : candidate)),
                        })
                      }
                      value={option.name}
                    />
                    <Select
                      aria-label={`Colour of ${option.name || 'option'}`}
                      className="w-32"
                      onChange={(color) =>
                        change(property.id, {
                          options: property.options?.map((candidate) => (candidate.id === option.id ? { ...candidate, color } : candidate)),
                        })
                      }
                      options={colorOptions}
                      size="small"
                      value={option.color}
                    />
                    <button
                      aria-label={`Remove ${option.name || 'option'}`}
                      className="text-button"
                      onClick={() => change(property.id, { options: property.options?.filter((candidate) => candidate.id !== option.id) })}
                      type="button"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-button w-fit text-sm"
                  onClick={() =>
                    change(property.id, { options: [...(property.options ?? []), { id: crypto.randomUUID(), name: '', color: tagColors[(property.options?.length ?? 0) % tagColors.length]! }] })
                  }
                  type="button"
                >
                  Add an option
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {draft.length < 30 && (
        <button
          className="text-button inline-flex w-fit items-center gap-1.5 text-sm"
          onClick={() => setDraft((current) => [...current, { id: crypto.randomUUID(), name: '', type: 'text' }])}
          type="button"
        >
          <Icon name="plus" size={14} />
          Add a property
        </button>
      )}
    </FormDialog>
  );
}
