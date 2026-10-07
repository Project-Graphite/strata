import { useState } from 'react';
import { useAction } from '../useAction';

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
  `${new Date(`${option.startsOn}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${option.startTime ? ` · ${option.startTime}` : ''}`;

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
    <ul className="m-0 grid list-none gap-0 p-0">
      {options.map((option) => (
        <li className="grid gap-2 border-b border-line-soft py-3" key={option.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="m-0 text-ink">{optionLabel(option)}</p>
              <p className="mono-sm m-0 mt-0.5 text-faint">
                {option.yes} yes · {option.maybe} maybe · {option.no} no
              </p>
            </div>
            <div aria-label={`Your answer for ${optionLabel(option)}`} className="flex gap-1.5" role="group">
              {(['yes', 'maybe', 'no'] as const).map((answer) => (
                <button
                  aria-pressed={option.mine === answer}
                  className={`${option.mine === answer ? 'primary-button' : 'secondary-button'} px-2.5 py-1 text-sm`}
                  disabled={busy}
                  key={answer}
                  onClick={() => onVote(option.id, answer)}
                  type="button"
                >
                  {answerLabels[answer]}
                </button>
              ))}
              {onPick && (
                <button className="text-button ml-2 text-sm" disabled={busy} onClick={() => onPick(option)} type="button">
                  Pick this date
                </button>
              )}
            </div>
          </div>
          {option.voters && option.voters.length > 0 && (
            <p className="m-0 text-sm text-muted">{option.voters.map((voter) => `${voter.name} (${answerLabels[voter.answer].toLowerCase()})`).join(', ')}</p>
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
        <div className="flex flex-wrap items-center gap-2" key={index}>
          <input aria-label={`Date ${index + 1}`} onChange={(event) => update(index, { startsOn: event.currentTarget.value })} type="date" value={row.startsOn} />
          <input
            aria-label={`Time ${index + 1} (optional)`}
            onChange={(event) => update(index, { startTime: event.currentTarget.value || null })}
            type="time"
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
          <button className="secondary-button px-3 py-1.5 text-sm" onClick={() => setRows([...rows, { startsOn: '', startTime: null }])} type="button">
            Add a date
          </button>
        )}
        <button className="primary-button px-3 py-1.5 text-sm" disabled={filled.length < 2 || saving.busy} type="submit">
          Save dates
        </button>
        <button className="text-button text-sm" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
