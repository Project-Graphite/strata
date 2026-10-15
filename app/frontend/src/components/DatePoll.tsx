import { useState } from 'react';
import { DatePicker } from '@project-graphite/ui';
import { useAction } from '../useAction';
import { clockTime, TimeField } from '../time';
import { Hint } from './Hint';
import { Button } from './Button';

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
  `${new Date(`${option.startsOn}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${option.startTime ? ` · ${clockTime(option.startTime)}` : ''}`;

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
              <p className="mono-sm m-0 mt-0.5 text-faint">
                {option.yes} yes · {option.maybe} maybe · {option.no} no
              </p>
            </div>
            <div aria-label={`Your answer for ${optionLabel(option)}`} className="flex gap-1.5" role="group">
              {(['yes', 'maybe', 'no'] as const).map((answer) => (
                <Button disabled={busy} key={answer} label={answerLabels[answer]} onClick={() => onVote(option.id, answer)} pressed={option.mine === answer} />
              ))}
              {onPick && (
                <button className="text-button ml-2 text-sm" disabled={busy} onClick={() => onPick(option)} type="button">
                  Pick this date
                </button>
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
  const [rows, setRows] = useState(() => (options.length ? options : [{ startsOn: '', startTime: null }, { startsOn: '', startTime: null }]));
  const saving = useAction();
  const filled = rows.filter((row) => row.startsOn);
  const update = (index: number, change: Partial<(typeof rows)[number]>) => setRows(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void saving.run(async () => {
          await onSave(filled);
          return 'The dates are saved.';
        }, 'Could not save the dates');
      }}
    >
      {rows.map((row, index) => (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)_auto] items-center gap-2" key={index}>
          <DatePicker aria-label={`Date ${index + 1}`} onChange={(startsOn) => update(index, { startsOn })} value={row.startsOn} />
          <TimeField
            aria-label={`Time ${index + 1} (optional)`}
            emptyLabel="Any time"
            onChange={(startTime) => update(index, { startTime: startTime || null })}
            value={row.startTime ?? ''}
          />
          {rows.length > 2 && (
            <button className="text-button text-sm" onClick={() => setRows(rows.filter((_, at) => at !== index))} type="button">
              Remove
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {rows.length < 10 && (
          <Button label="Add a date" onClick={() => setRows([...rows, { startsOn: '', startTime: null }])} />
        )}
        <Button disabled={filled.length < 2 || saving.busy} label="Save dates" primary submit />
        <button className="text-button text-sm" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
