import { useState } from 'react';
import { Avatar, Checkbox, Fieldset, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Member } from '../spaces';
import type { CostSplit } from '../subscriptions';
import { useAction } from '../useAction';
import { TextButton } from './Button';
import { FormDialog } from './FormDialog';

export function SplitEditor({
  item,
  members,
  onClose,
  onSaved,
}: {
  item: { id: string; name: string; split: CostSplit | null };
  members: Member[];
  onClose: () => void;
  onSaved: (split: CostSplit | null) => void;
}) {
  const auth = useAuth();
  const saving = useAction();
  const current = item.split;
  const [payerId, setPayerId] = useState(current?.payerId ?? auth.user?.id ?? members[0]?.userId ?? '');
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(current ? current.shares.map((share) => [share.userId, share.weight]) : members.map((member) => [member.userId, 1])),
  );
  const shares = Object.entries(weights).map(([userId, weight]) => ({ userId, weight }));
  const total = shares.reduce((sum, share) => sum + share.weight, 0);

  return (
    <FormDialog
      busy={saving.busy}
      busyLabel={current ? 'Saving…' : 'Adding…'}
      onClose={onClose}
      onSubmit={() =>
        void saving
          .run(async () => {
            if (shares.length < 2) throw new Error('Split between at least two members.');
            onSaved(await auth.request<CostSplit>(`/subscriptions/${item.id}/split`, { method: 'PUT', body: JSON.stringify({ payerId, shares }) }));
            return `Split ${item.name} between ${shares.length} members.`;
          }, 'Could not save the split')
          .then((saved) => saved && onClose())
      }
      start={
        current && (
          <TextButton
            danger
            disabled={saving.busy}
            label="Stop splitting"
            onClick={() =>
              void saving
                .run(async () => {
                  await auth.request(`/subscriptions/${item.id}/split`, { method: 'DELETE' });
                  onSaved(null);
                  return `Stopped splitting ${item.name}.`;
                }, 'Could not change the split')
                .then((done) => done && onClose())
            }
          />
        )
      }
      submitLabel={current ? 'Save changes' : 'Add split'}
      title={current ? 'Edit split' : 'New split'}
    >
      <Select
        label="Paid by"
        onChange={setPayerId}
        options={members.map((member) => ({ value: member.userId, label: member.displayName, leading: <Avatar name={member.displayName} size="sm" /> }))}
        value={payerId}
      />
      <Fieldset className="grid gap-2" legend="Shared by">
        {members.map((member) => {
          const weight = weights[member.userId];
          return (
            <div className="flex items-center gap-3" key={member.userId}>
              <Checkbox
                checked={weight !== undefined}
                className="flex-1"
                label={member.displayName}
                onChange={(event) => {
                  const { [member.userId]: _removed, ...rest } = weights;
                  setWeights(event.currentTarget.checked ? { ...rest, [member.userId]: 1 } : rest);
                }}
              />
              {weight !== undefined && (
                <>
                  <div className="w-24 shrink-0">
                    <TextField
                      aria-label={`Shares for ${member.displayName}`}
                      inputMode="numeric"
                      label=""
                      max={100}
                      min={1}
                      onChange={(event) => setWeights({ ...weights, [member.userId]: Math.min(100, Math.max(1, Number(event.currentTarget.value) || 1)) })}
                      type="number"
                      value={weight}
                    />
                  </div>
                  <span className="w-10 text-right text-small text-muted tabular-nums">{Math.round((weight / total) * 100)}%</span>
                </>
              )}
            </div>
          );
        })}
      </Fieldset>
    </FormDialog>
  );
}
