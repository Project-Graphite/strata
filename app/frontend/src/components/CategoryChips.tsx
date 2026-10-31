import { Fieldset, FilterChip } from '@project-graphite/ui';
import { categoryName, type SpendingCategory } from '../spending';

export function CategoryChips({ categories, label = 'Category', onChange, value }: { categories: SpendingCategory[]; label?: string; onChange: (value: string) => void; value: string }) {
  return (
    <Fieldset legend={label}>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <FilterChip
            active={category.name === value}
            color={category.colour}
            key={category.name}
            label={categoryName(category.name)}
            onClick={() => onChange(category.name)}
          />
        ))}
      </div>
    </Fieldset>
  );
}
