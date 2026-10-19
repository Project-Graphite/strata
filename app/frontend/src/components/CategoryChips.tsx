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
      <legend className="field-label mb-2 p-0">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {shown.map((category) => (
          <button
            aria-pressed={category.name === value}
            className={`category-chip ${category.name === value ? 'category-chip-chosen' : ''}`}
            key={category.name}
            onClick={() => onChange(category.name)}
            type="button"
          >
            <span aria-hidden="true" className={`swatch-dot tag-${category.colour}`} />
            {categoryName(category.name)}
          </button>
        ))}
        {categories.length > shown.length && (
          <TextButton label="More…" onClick={() => setAll(true)} />
        )}
      </div>
    </fieldset>
  );
}
