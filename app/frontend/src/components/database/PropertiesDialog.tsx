import { useState } from 'react';
import { ConfirmDialog, IconButton, Select, tagColors, TextField } from '@project-graphite/ui';
import { TextButton } from '../Button';
import { FormDialog } from '../FormDialog';
import { propertyTypes, type Property, type PropertyType } from '../../notes';
import { colorOptions } from '../../spaces';
import { Hint } from '../Hint';

const hasOptions = (type: PropertyType) => type === 'select' || type === 'multiSelect';

function clearedBy(before: Property[], after: Property[]) {
  return before.flatMap((original) => {
    const kept = after.find((property) => property.id === original.id);
    if (!kept) return [`Every ${original.name} value`];
    if (kept.type !== original.type) return [`Every ${original.name} value, since its kind changed`];
    const dropped = (original.options ?? []).filter((option) => !kept.options?.some((candidate) => candidate.id === option.id));
    return dropped.length ? [`${dropped.map((option) => `“${option.name}”`).join(', ')} in ${original.name}`] : [];
  });
}

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
  const [clearing, setClearing] = useState<{ saved: Property[]; cleared: string[] }>();
  const change = (id: string, next: Partial<Property>) => setDraft((current) => current.map((property) => (property.id === id ? { ...property, ...next } : property)));

  if (clearing) {
    return (
      <ConfirmDialog
        busyLabel="Saving…"
        confirmLabel="Save and clear"
        onClose={() => setClearing(undefined)}
        onConfirm={async () => onSave(clearing.saved)}
        title="Clear values on every page?"
        tone="danger"
      >
        <p className="m-0">Saving clears these from every page in this database:</p>
        <ul className="m-0 list-disc pl-5">
          {clearing.cleared.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ConfirmDialog>
    );
  }

  return (
    <FormDialog
      busy={busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={() => {
        const saved = draft
          .map((property) => ({ ...property, name: property.name.trim() || 'Untitled' }))
          .map(({ options, ...property }) =>
            hasOptions(property.type) ? { ...property, options: (options ?? []).filter((option) => option.name.trim()).map((option) => ({ ...option, name: option.name.trim() })) } : property,
          );
        const cleared = clearedBy(properties, saved);
        if (cleared.length) setClearing({ saved, cleared });
        else onSave(saved);
      }}
      submitLabel="Save"
      title="Edit properties"
    >
      {draft.length === 0 && <Hint>Pages in this database have no properties yet.</Hint>}
      <ul className="m-0 grid list-none gap-4 p-0">
        {draft.map((property) => (
          <li className="grid gap-2" key={property.id}>
            <div className="flex items-center gap-2">
              <TextField
                className="min-w-0 flex-1"
                label="Property name"
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
              <IconButton
                icon="x"
                label={`Remove ${property.name || 'property'}`}
                onClick={() => setDraft((current) => current.filter((candidate) => candidate.id !== property.id))}
                size="small"
              />
            </div>
            {hasOptions(property.type) && (
              <div className="ml-4 grid gap-1.5">
                {(property.options ?? []).map((option) => (
                  <div className="flex items-center gap-2" key={option.id}>
                    <TextField
                      aria-label="Option name"
                      className="min-w-0 flex-1"
                      maxLength={60}
                      onChange={(event) =>
                        change(property.id, {
                          options: property.options?.map((candidate) => (candidate.id === option.id ? { ...candidate, name: event.currentTarget.value } : candidate)),
                        })
                      }
                      placeholder="Option name"
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
                      value={option.color}
                    />
                    <IconButton
                      icon="x"
                      label={`Remove ${option.name || 'option'}`}
                      onClick={() => change(property.id, { options: property.options?.filter((candidate) => candidate.id !== option.id) })}
                      size="small"
                    />
                  </div>
                ))}
                <TextButton
                  label="Add an option"
                  onClick={() =>
                    change(property.id, { options: [...(property.options ?? []), { id: crypto.randomUUID(), name: '', color: tagColors[(property.options?.length ?? 0) % tagColors.length]! }] })
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {draft.length < 30 && (
        <TextButton icon="plus" label="Add a property" onClick={() => setDraft((current) => [...current, { id: crypto.randomUUID(), name: '', type: 'text' }])} />
      )}
    </FormDialog>
  );
}
