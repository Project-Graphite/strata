import { GridListbox } from '@project-graphite/ui';

const ordinal = (day: number) => `${day}${day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'}`;

export function DayOfMonthField({
  defaultValue,
  emptyLabel,
  label,
  last,
  name,
  presets = [],
}: {
  defaultValue: string;
  emptyLabel: string;
  label: string;
  last: number;
  name: string;
  presets?: { label: string; value: string }[];
}) {
  return (
    <GridListbox
      columns={7}
      defaultValue={defaultValue}
      emptyLabel={emptyLabel}
      groups={[
        {
          label: 'Day of the month',
          options: [
            ...presets.map((preset) => ({ ...preset, wide: true })),
            ...Array.from({ length: last }, (_, index) => ({ label: ordinal(index + 1), value: String(index + 1) })),
          ],
        },
      ]}
      label={label}
      name={name}
    />
  );
}
