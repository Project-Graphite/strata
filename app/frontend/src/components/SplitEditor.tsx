import { useState } from 'react';
import { Avatar, Select } from '@project-graphite/ui';
import { useAuth } from '../auth';
import type { Member } from '../spaces';
import type { CostSplit } from '../subscriptions';
import { useAction } from '../useAction';
import { FormDialog } from './FormDialog';

export function SplitEditor({
  item,
  kind,
  members,
  onClose,
  onSaved,
}: {
  item: { id: string; name: string; split: CostSplit | null };
  kind: 'subscriptions' | 'expenses';
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
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={() =>
        void saving
          .run(async () => {
            if (shares.length < 2) throw new Error('Split between at least two members.');
            onSaved(await auth.request<CostSplit>(`/${kind}/${item.id}/split`, { method: 'PUT', body: JSON.stringify({ payerId, shares }) }));
            return `${item.name} is split between ${shares.length} members.`;
          }, 'Could not save the split')
          .then((saved) => saved && onClose())
      }
      submitLabel="Save split"
      title={`Split ${item.name}`}
    >
      <Select
        label="Paid by"
        onChange={setPayerId}
        options={members.map((member) => ({ value: member.userId, label: member.displayName, leading: <Avatar name={member.displayName} size="sm" /> }))}
        value={payerId}
      />
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="field-label mb-1.5 p-0">Shared by</legend>
        {members.map((member) => {
          const weight = weights[member.userId];
          return (
            <div className="flex items-center gap-3" key={member.userId}>
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input
                  checked={weight !== undefined}
                  onChange={(event) => {
                    const { [member.userId]: _removed, ...rest } = weights;
                    setWeights(event.currentTarget.checked ? { ...rest, [member.userId]: 1 } : rest);
                  }}
                  type="checkbox"
                />
                {member.displayName}
              </label>
              {weight !== undefined && (
                <>
                  <input
                    aria-label={`Shares for ${member.displayName}`}
                    className="w-16 text-sm"
                    max={100}
                    min={1}
                    onChange={(event) => setWeights({ ...weights, [member.userId]: Math.min(100, Math.max(1, Number(event.currentTarget.value) || 1)) })}
                    type="number"
                    value={weight}
                  />
                  <span className="mono-sm w-10 text-right text-faint">{Math.round((weight / total) * 100)}%</span>
                </>
              )}
            </div>
          );
        })}
      </fieldset>
      {current && (
        <button
          className="text-button w-fit text-sm"
          disabled={saving.busy}
          onClick={() =>
            void saving
              .run(async () => {
                await auth.request(`/${kind}/${item.id}/split`, { method: 'DELETE' });
                onSaved(null);
                return `${item.name} is no longer split.`;
              }, 'Could not change the split')
              .then((done) => done && onClose())
          }
          type="button"
        >
          Stop splitting
        </button>
      )}
    </FormDialog>
  );
}
