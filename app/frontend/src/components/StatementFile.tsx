import { useState } from 'react';
import { Select } from '@project-graphite/ui';
import { dateOrder, guessColumns, parseCsv, readCharges, statementCurrency, withoutPreamble, type DateOrder, type StatementColumns } from '../statement';
import { FileButton } from './FileButton';

const orders: { value: DateOrder; label: string; hint: string }[] = [
  { value: 'dmy', label: 'Day first', hint: '31/01/2026' },
  { value: 'mdy', label: 'Month first', hint: '01/31/2026' },
  { value: 'ymd', label: 'Year first', hint: '2026-01-31' },
];

export function useStatementFile(onCurrency: (code: string) => void) {
  const [rows, setRows] = useState<string[][]>();
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState<StatementColumns>({ date: 0, description: 0, amount: 0 });
  const [order, setOrder] = useState<DateOrder>('dmy');

  async function read(file: File) {
    const parsed = withoutPreamble(parseCsv(await file.text()));
    const guessed = guessColumns(parsed);
    const currency = statementCurrency(parsed, guessed.amount);
    if (currency) onCurrency(currency);
    setFileName(file.name);
    setRows(parsed);
    setColumns(guessed);
    setOrder(dateOrder(parsed.slice(1, 50).map((row) => row[guessed.date] ?? '')));
  }

  const columnSelect = (label: string, key: keyof StatementColumns) => (
    <Select
      label={label}
      onChange={(index) => setColumns({ ...columns, [key]: Number(index) })}
      options={(rows?.[0] ?? []).map((title, index) => ({ value: String(index), label: title || `Column ${index + 1}` }))}
      value={String(columns[key])}
    />
  );

  return {
    charges: rows ? readCharges(rows, columns, order) : [],
    loaded: Boolean(rows),
    picker: (
      <div className="flex flex-wrap items-center gap-3">
        <FileButton accept=".csv,text/csv" inputLabel="Statement file" label={rows ? 'Choose another file' : 'Choose a CSV file'} onFiles={(files) => void read(files[0]!)} />
        {fileName && <span className="truncate text-sm text-muted">{fileName}</span>}
      </div>
    ),
    columns: rows && (
      <div className="grid gap-4 sm:grid-cols-2">
        {columnSelect('Date column', 'date')}
        {columnSelect('Description column', 'description')}
        {columnSelect('Amount column', 'amount')}
        <Select label="Dates are written" onChange={setOrder} options={orders} value={order} />
      </div>
    ),
  };
}
