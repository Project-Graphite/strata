import { useState } from 'react';
import { Select, TextAreaField, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { periodChoices, periodLabel, periodStart, type Goal, type GoalPeriod } from '../goals';
import type { Space } from '../spaces';
import { useAction } from '../useAction';
import { dayKey } from '../agenda';
import { atMost, required, useFormErrors, type Check } from '../validation';
import { FormDialog } from './FormDialog';

const numberCheck: Check = (value) => (!value.trim() || Number.isFinite(Number(value.replace(',', '.'))) ? undefined : 'Enter a number such as 12.5.');
const toNumber = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim().replace(',', '.');
  return text ? Number(text) : null;
};

const periods: { value: GoalPeriod; label: string }[] = [
  { value: 'year', label: 'A year' },
  { value: 'quarter', label: 'A quarter' },
  { value: 'month', label: 'A month' },
];

export function GoalEditor({ goal, onClose, onSaved, spaces }: { goal?: Goal; onClose: () => void; onSaved: (goal: Goal) => void; spaces: Space[] }) {
  const auth = useAuth();
  const saving = useAction();
  const form = useFormErrors();
  const today = dayKey(new Date());
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'year');
  const [startsOn, setStartsOn] = useState(goal?.startsOn ?? periodStart('year', today));
  const [measure, setMeasure] = useState<'tasks' | 'number'>(goal?.target ? 'number' : 'tasks');
  const choices = periodChoices(period, today);

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={goal ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={(target) => {
        if (
          !form.check(target, {
            title: [required('Name the goal.'), atMost(200, 'Use at most 200 characters.')],
            ...(measure === 'number' ? { target: [required('Enter the number to reach.'), numberCheck], current: [numberCheck] } : {}),
          })
        ) {
          return;
        }
        const values = new FormData(target);
        const body = {
          title: String(values.get('title')).trim(),
          period,
          startsOn,
          why: String(values.get('why') ?? '').trim(),
          target: measure === 'number' ? toNumber(values.get('target')) : null,
          current: measure === 'number' ? toNumber(values.get('current')) : null,
          unit: measure === 'number' ? String(values.get('unit') ?? '').trim() || null : null,
        };
        void saving
          .run(async () => {
            onSaved(
              await auth.request<Goal>(goal ? `/goals/${goal.id}` : `/spaces/${String(values.get('spaceId'))}/goals`, {
                method: goal ? 'PATCH' : 'POST',
                body: JSON.stringify(body),
              }),
            );
            return `${goal ? 'Saved' : 'Added'} ${body.title}.`;
          }, 'Could not save the goal')
          .then((saved) => saved && onClose());
      }}
      submitLabel={goal ? 'Save changes' : 'Add goal'}
      title={goal ? 'Edit goal' : 'New goal'}
    >
      <TextField autoFocus defaultValue={goal?.title} label="Goal" maxLength={200} {...form.field('title')} />
      {!goal && spaces[0] && <input name="spaceId" type="hidden" value={spaces[0]!.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="For"
          onChange={(next) => {
            setPeriod(next);
            setStartsOn(periodStart(next, startsOn > today ? startsOn : today));
          }}
          options={periods}
          value={period}
        />
        <Select label="Which" onChange={setStartsOn} options={choices.some((choice) => choice.value === startsOn) ? choices : [{ value: startsOn, label: periodLabel(period, startsOn) }, ...choices]} value={startsOn} />
      </div>
      <Select
        label="Measure progress by"
        onChange={setMeasure}
        options={[
          { value: 'tasks', label: 'Linked tasks', hint: 'Done out of all' },
          { value: 'number', label: 'A number', hint: 'Such as km run' },
        ]}
        value={measure}
      />
      {measure === 'number' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField defaultValue={goal?.target ?? ''} inputMode="decimal" label="Target" {...form.field('target')} />
          <TextField defaultValue={goal?.current ?? ''} inputMode="decimal" label="So far" {...form.field('current')} />
          <TextField defaultValue={goal?.unit ?? ''} label="Unit (optional)" maxLength={20} name="unit" />
        </div>
      )}
      <TextAreaField defaultValue={goal?.why} label="Why it matters (optional)" maxLength={2000} name="why" rows={3} />
    </FormDialog>
  );
}
