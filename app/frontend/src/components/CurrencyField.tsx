import { Select } from '@project-graphite/ui';
import { allCurrencies, currencyName } from '../choices';

const famous = ['EGP', 'USD', 'EUR'];

export function CurrencyField({
  codes = allCurrencies,
  defaultValue,
  hint,
  label = 'Currency',
  name,
  noneLabel,
  onChange,
  value,
}: {
  codes?: string[];
  defaultValue?: string;
  hint?: string;
  label?: string;
  name?: string;
  noneLabel?: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  return (
    <Select
      defaultValue={defaultValue}
      hint={hint}
      label={label}
      name={name}
      onChange={onChange}
      options={[
        ...(noneLabel ? [{ value: '', label: noneLabel }] : []),
        ...[...new Set([...famous, ...codes])].map((code) => ({ value: code, label: `${code} · ${currencyName(code)}` })),
      ]}
      searchable
      value={value}
    />
  );
}
