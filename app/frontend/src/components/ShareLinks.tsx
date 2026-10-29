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
import { Subheading } from './Page';
import { PagePeople } from './PagePeople';
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

export function ShareLinks({ editLinks, itemId, noun, onClose, page = false }: { editLinks: boolean; itemId: string; noun: string; onClose: () => void; page?: boolean }) {
  const auth = useAuth();
  const links = useResource<ShareLink[]>(`/items/${itemId}/share-links`, true);
  const action = useAction();
  const [access, setAccess] = useState<Access>('view');
  const [days, setDays] = useState('30');
  const [turningOff, setTurningOff] = useState<ShareLink>();
  const [linkRows] = useRememberedShape('share-links', links.data && [links.data.length], [0]);

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
        Anyone using this link will lose access.
      </ConfirmDialog>
    );
  }

  return (
    <Dialog onClose={onClose} title={`Share ${noun}`}>
      <div className="mt-5 grid gap-5">
        {page && <PagePeople itemId={itemId} />}
        <section aria-label="Anyone with the link" className={`grid gap-3 ${page ? 'border-t border-line pt-5' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Subheading>Anyone with the link</Subheading>
            {page && <Hint>This page only</Hint>}
          </div>
          <div className={`grid grid-cols-1 items-stretch gap-3 ${editLinks ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}>
            {editLinks && <Select label="Access" onChange={setAccess} options={accessOptions} size="small" value={access} />}
            <Select label="Expires in" onChange={setDays} options={durationOptions} size="small" value={days} />
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
          </div>
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
                      <ButtonSkeleton width="w-24" />
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
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-line p-3" key={link.id}>
                  <p className="m-0 text-sm text-ink">
                    {link.access === 'edit' ? 'Can edit' : 'Can view'}
                    <span className="text-faint">
                      {' · Expires '}
                      {formatDay(dayKey(new Date(link.expiresAt)), { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {link.link ? <Copyable compact value={link.link} /> : <Hint>Link unavailable</Hint>}
                    <TextButton label="Turn off" onClick={() => setTurningOff(link)} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Hint>No links</Hint>
          )}
        </section>
      </div>
    </Dialog>
  );
}
