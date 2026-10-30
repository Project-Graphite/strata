import { useState } from 'react';
import { DatePicker, formatDay } from '@project-graphite/ui';
import { useAction } from '../useAction';
import { clockTime, TimeField } from '../time';
import { Hint } from './Hint';
import { Button, TextButton } from './Button';

export type PollAnswer = 'yes' | 'maybe' | 'no';

export interface PollOption {
  id: string;
  startsOn: string;
  startTime: string | null;
  yes: number;
  maybe: number;
  no: number;
  mine: PollAnswer | null;
  voters?: { name: string; answer: PollAnswer }[];
}

const answerLabels: Record<PollAnswer, string> = { yes: 'Yes', maybe: 'Maybe', no: 'No' };

export const optionLabel = (option: { startsOn: string; startTime: string | null }) =>
  `${formatDay(option.startsOn)}${option.startTime ? ` · ${clockTime(option.startTime)}` : ''}`;

export function PollOptions({
  options,
  onVote,
  onPick,
  busy,
}: {
  options: PollOption[];
  onVote: (optionId: string, answer: PollAnswer) => void;
  onPick?: (option: PollOption) => void;
  busy: boolean;
}) {
  return (
    <ul className="panel-rows">
      {options.map((option) => (
        <li className="grid gap-2 panel-row" key={option.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="m-0 text-ink">{optionLabel(option)}</p>
              <p className="m-0 mt-0.5 text-small text-muted">
                {option.yes} yes · {option.maybe} maybe · {option.no} no
              </p>
            </div>
            <div aria-label={`Your answer for ${optionLabel(option)}`} className="flex items-center gap-1.5" role="group">
              {(['yes', 'maybe', 'no'] as const).map((answer) => (
                <Button disabled={busy} key={answer} label={answerLabels[answer]} onClick={() => onVote(option.id, answer)} pressed={option.mine === answer} />
              ))}
              {onPick && (
                <span className="ml-2">
                  <TextButton disabled={busy} label="Pick this date" onClick={() => onPick(option)} />
                </span>
              )}
            </div>
          </div>
          {option.voters && option.voters.length > 0 && (
            <Hint>{option.voters.map((voter) => `${voter.name} (${answerLabels[voter.answer].toLowerCase()})`).join(', ')}</Hint>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PollEditor({
  options,
  onSave,
  onCancel,
}: {
  options: { startsOn: string; startTime: string | null }[];
  onSave: (options: { startsOn: string; startTime: string | null }[]) => Promise<unknown>;
  onCancel: () => void;
}) {
  const blank = () => ({ id: crypto.randomUUID(), startsOn: '', startTime: null as string | null });
  const [rows, setRows] = useState(() => (options.length ? options.map((option) => ({ ...option, id: crypto.randomUUID() })) : [blank(), blank()]));
  const saving = useAction();
  const filled = rows.filter((row) => row.startsOn);
  const update = (index: number, change: Partial<(typeof rows)[number]>) => setRows(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void saving.run(async () => {
          await onSave(filled.map(({ startsOn, startTime }) => ({ startsOn, startTime })));
          return 'Saved the dates.';
        }, 'Could not save the dates');
      }}
    >
      {rows.map((row, index) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_auto]" key={row.id}>
          <DatePicker aria-label={`Date ${index + 1}`} className="max-sm:col-span-2" onChange={(startsOn) => update(index, { startsOn })} value={row.startsOn} />
          <TimeField
            aria-label={`Time ${index + 1} (optional)`}
            emptyLabel="Any time"
            onChange={(startTime) => update(index, { startTime: startTime || null })}
            value={row.startTime ?? ''}
          />
          {rows.length > 2 && <TextButton label="Remove" onClick={() => setRows(rows.filter((_, at) => at !== index))} />}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {rows.length < 10 && <Button icon="plus" label="Add a date" onClick={() => setRows([...rows, blank()])} />}
        <Button label="Cancel" onClick={onCancel} />
        <Button disabled={filled.length < 2 || saving.busy} label={saving.busy ? 'Saving…' : 'Save dates'} primary submit />
      </div>
    </form>
  );
}
