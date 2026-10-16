import { useState } from 'react';
import { ConfirmDialog, Select, tagColors, TextField, type TagColor } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { categoryName, type SpendingCategory } from '../spending';
import { useAction } from '../useAction';
import { Button, IconButton } from './Button';
import { FormDialog } from './FormDialog';

interface Row extends SpendingCategory {
  key: number;
  previous?: string;
}

const colourOptions = tagColors.map((colour) => ({ value: colour, label: categoryName(colour), leading: <span aria-hidden="true" className={`swatch-dot tag-${colour}`} /> }));

export function CategoriesEditor({ categories, onClose, onSaved, spaceId }: { categories: SpendingCategory[]; onClose: () => void; onSaved: () => void; spaceId: string }) {
  const auth = useAuth();
  const saving = useAction();
  const [rows, setRows] = useState<Row[]>(categories.map((category, key) => ({ ...category, key, previous: category.name })));
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<SpendingCategory[]>();
  const change = (key: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index: number, by: number) =>
    setRows((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by]!, next[index]!];
      return next;
    });
  const save = () =>
    auth.request(`/spaces/${spaceId}/spending-categories`, {
      method: 'PUT',
      body: JSON.stringify({ categories: rows.map(({ name, colour, previous }) => ({ name: name.trim(), colour, ...(previous ? { previous } : {}) })) }),
    });

  if (removing) {
    return (
      <ConfirmDialog
        busyLabel="Saving…"
        confirmLabel="Save and move"
        errorFallback="Could not save the categories"
        onClose={() => setRemoving(undefined)}
        onConfirm={async () => {
          await save();
          onSaved();
          saving.report('Saved the categories.');
          onClose();
        }}
        title="Move transactions to Other?"
        tone="danger"
      >
        <p className="m-0">Saving moves the transactions in these categories to Other, and removes any budgets for them:</p>
        <ul className="m-0 list-disc pl-5">
          {removing.map((category) => (
            <li key={category.name}>
              {categoryName(category.name)}: {category.uses} transaction{category.uses === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    );
  }

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={() => {
        const names = rows.map((row) => row.name.trim());
        if (names.some((name) => !name || name.length > 40)) return setError('Name each category in 1 to 40 characters.');
        if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) return setError('Give each category a different name.');
        setError('');
        const inUse = categories.filter((category) => category.uses && !rows.some((row) => row.previous === category.name));
        if (inUse.length) return setRemoving(inUse);
        void saving
          .run(async () => {
            await save();
            onSaved();
            return 'Saved the categories.';
          }, 'Could not save the categories')
          .then((done) => done && onClose());
      }}
      submitLabel="Save"
      title="Edit categories"
    >
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((row, index) => (
          <li className="flex flex-wrap items-end gap-2" key={row.key}>
            <TextField
              aria-label={`Name of category ${index + 1}`}
              className="min-w-0 flex-1 max-sm:basis-full"
              disabled={row.previous === 'other'}
              label=""
              maxLength={40}
              onChange={(event) => change(row.key, { name: event.target.value })}
              value={row.previous === 'other' ? 'Other' : row.name}
            />
            <Select aria-label={`Colour of ${row.name || 'category'}`} onChange={(colour: TagColor) => change(row.key, { colour })} options={colourOptions} size="small" value={row.colour} />
            <IconButton disabled={index === 0} icon="chevron-up" label={`Move ${row.name} up`} onClick={() => move(index, -1)} />
            <IconButton disabled={index === rows.length - 1} icon="chevron-down" label={`Move ${row.name} down`} onClick={() => move(index, 1)} />
            <IconButton disabled={row.previous === 'other'} icon="x" label={`Remove ${row.name}`} onClick={() => setRows((current) => current.filter((shown) => shown.key !== row.key))} />
          </li>
        ))}
      </ul>
      <Button disabled={rows.length >= 40} label="Add a category" onClick={() => setRows((current) => [...current, { key: Math.max(...current.map((row) => row.key)) + 1, name: '', colour: 'gray' }])} />
      {error && (
        <p className="error-message m-0" role="alert">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
