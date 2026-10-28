import { useState } from 'react';
import { Fieldset, FilterChip } from '@project-graphite/ui';
import { categoryName, type SpendingCategory } from '../spending';
import { TextButton } from './Button';

const shownFirst = 6;

export function CategoryChips({ categories, label = 'Category', onChange, value }: { categories: SpendingCategory[]; label?: string; onChange: (value: string) => void; value: string }) {
  const [all, setAll] = useState(false);
  const favourites = [...categories].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0)).slice(0, shownFirst);
  const shown = all ? categories : categories.filter((category) => favourites.includes(category) || category.name === value);

  return (
    <Fieldset legend={label}>
      <div className="flex flex-wrap gap-2">
        {shown.map((category) => (
          <FilterChip
            active={category.name === value}
            color={category.colour}
            key={category.name}
            label={categoryName(category.name)}
            onClick={() => onChange(category.name)}
          />
        ))}
        {categories.length > shown.length && (
          <TextButton label="More…" onClick={() => setAll(true)} />
        )}
      </div>
    </Fieldset>
  );
}
