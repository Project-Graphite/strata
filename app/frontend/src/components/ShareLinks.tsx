import { useState } from 'react';
import { ConfirmDialog, Dialog, formatDay, Placeholder, Select } from '@project-graphite/ui';
import { dayKey } from '../agenda';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Copyable } from './Copyable';
import { Hint } from './Hint';
import { LoadError } from './LoadError';
import { Button, TextButton } from './Button';
import { DialogActions } from './DialogActions';
import { Subheading } from './Page';
import { ButtonSkeleton, HintSkeleton, rowsOf, SkeletonLine, useRememberedShape } from './Skeletons';

type Access = 'view' | 'edit';

interface ShareLink {
  id: string;
  access: Access;
  expiresAt: string;
  createdAt: string;
  link: string | null;
}

const accessOptions = [
  { value: 'view' as const, label: 'Can view' },
  { value: 'edit' as const, label: 'Can edit' },
];

const durationOptions = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '365', label: '1 year' },
];

export function ShareLinks({ editLinks, itemId, noun, onClose }: { editLinks: boolean; itemId: string; noun: string; onClose: () => void }) {
  const auth = useAuth();
  const links = useResource<ShareLink[]>(`/items/${itemId}/share-links`, true);
  const action = useAction();
  const [access, setAccess] = useState<Access>('view');
  const [days, setDays] = useState('30');
  const [turningOff, setTurningOff] = useState<ShareLink>();
  const [linkRows, shownLinks] = useRememberedShape('share-links', links.data && [links.data.length, links.data.filter((link) => link.link).length], [0, 0]);

  if (turningOff) {
    return (
      <ConfirmDialog
        busyLabel="Turning off…"
        confirmLabel="Turn off link"
        errorFallback="Could not turn off the link"
        onClose={() => setTurningOff(undefined)}
        onConfirm={async () => {
          await auth.request(`/items/${itemId}/share-links/${turningOff.id}`, { method: 'DELETE' });
          links.mutate((current) => current.filter((shown) => shown.id !== turningOff.id));
          action.report('Turned off the link.');
        }}
        title="Turn off this link?"
        tone="danger"
      >
        Anyone with it loses access to this {noun} straight away.
      </ConfirmDialog>
    );
  }

  return (
    <Dialog onClose={onClose} title={`Share this ${noun}`}>
      <div className="mt-5 grid gap-4">
        <Hint>Anyone with a link can open this {noun} without an account, until the link ends or you turn it off.</Hint>
        <div className={`grid gap-3 ${editLinks ? 'sm:grid-cols-2' : ''}`}>
          {editLinks && <Select label="People with the link" onChange={setAccess} options={accessOptions} value={access} />}
          <Select label="Link works for" onChange={setDays} options={durationOptions} value={days} />
        </div>
        <Button
          disabled={action.busy}
          label={action.busy ? 'Creating…' : 'Create link'}
          onClick={() =>
            void action.run(async () => {
              const created = await auth.request<ShareLink>(`/items/${itemId}/share-links`, {
                method: 'POST',
                body: JSON.stringify({ access, expiresInDays: Number(days) }),
              });
              links.mutate((current) => [created, ...current]);
              return 'Created the link.';
            }, 'Could not create the link')
          }
          primary
        />
        <Subheading>Links</Subheading>
        {links.error ? (
          <LoadError compact error={links.error} onRetry={links.reload} />
        ) : links.loading ? (
          <Placeholder label="Loading links">
            {linkRows ? (
              <ul aria-hidden="true" className="m-0 grid list-none gap-3 p-0">
                {rowsOf(linkRows).map((row) => (
                  <li className="grid gap-2 rounded-panel border border-line p-3" key={row}>
                    <div className="flex items-center justify-between gap-3">
                      <SkeletonLine className="text-sm" width="w-40" />
                      <ButtonSkeleton width="w-20" />
                    </div>
                    {row < shownLinks ? (
                      <div className="flex items-start gap-2">
                        <div className="mono-sm min-w-0 flex-1 rounded-field border border-line p-3">
                          <SkeletonLine width="w-full" />
                        </div>
                        <ButtonSkeleton width="w-16" />
                      </div>
                    ) : (
                      <HintSkeleton />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <HintSkeleton />
            )}
          </Placeholder>
        ) : links.data?.length ? (
          <ul className="m-0 grid list-none gap-3 p-0">
            {links.data.map((link) => (
              <li className="grid gap-2 rounded-panel border border-line p-3" key={link.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="m-0 text-sm text-ink">
                    {link.access === 'edit' ? 'Can edit' : 'Can view'}
                    <span className="text-faint">
                      {' · Until '}
                      {formatDay(dayKey(new Date(link.expiresAt)), { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </p>
                  <TextButton label="Turn off" onClick={() => setTurningOff(link)} />
                </div>
                {link.link ? (
                  <Copyable value={link.link} />
                ) : (
                  <Hint>This older link can’t be shown again. Turn it off and create a new one to copy it.</Hint>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Hint>No links yet. Only members of this space can open this {noun}.</Hint>
        )}
        <DialogActions>
          <Button label="Done" large onClick={onClose} />
        </DialogActions>
      </div>
    </Dialog>
  );
}
