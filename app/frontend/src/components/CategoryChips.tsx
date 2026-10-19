import Chip from '@mui/material/Chip';
import FormLabel from '@mui/material/FormLabel';
import { useState } from 'react';
import { categoryName, type SpendingCategory } from '../spending';
import { TextButton } from './Button';

const shownFirst = 6;

export function CategoryChips({ categories, label = 'Category', onChange, value }: { categories: SpendingCategory[]; label?: string; onChange: (value: string) => void; value: string }) {
  const [all, setAll] = useState(false);
  const favourites = [...categories].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0)).slice(0, shownFirst);
  const shown = all ? categories : categories.filter((category) => favourites.includes(category) || category.name === value);

  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <FormLabel className="mb-2" component="legend">{label}</FormLabel>
      <div className="flex flex-wrap gap-2">
        {shown.map((category) => (
          <Chip
            aria-pressed={category.name === value}
            icon={<span aria-hidden="true" className={`swatch-dot ml-2 tag-${category.colour}`} />}
            key={category.name}
            label={categoryName(category.name)}
            onClick={() => onChange(category.name)}
            variant={category.name === value ? 'filled' : 'outlined'}
          />
        ))}
        {categories.length > shown.length && (
          <TextButton label="More…" onClick={() => setAll(true)} />
        )}
      </div>
    </fieldset>
  );
}
