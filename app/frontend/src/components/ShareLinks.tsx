import { useState } from 'react';
import { Dialog, LinesSkeleton, Select } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { CopyLink } from './CopyLink';
import { Hint } from './Hint';

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

function ShareDialog({ editLinks, itemId, noun, onClose }: { editLinks: boolean; itemId: string; noun: string; onClose: () => void }) {
  const auth = useAuth();
  const links = useResource<ShareLink[]>(`/items/${itemId}/share-links`, true);
  const action = useAction();
  const [access, setAccess] = useState<Access>('view');
  const [days, setDays] = useState('30');

  return (
    <Dialog onClose={onClose} title={`Share this ${noun}`}>
      <p className="mt-2 mb-0 text-sm text-muted">Anyone with a link can open this {noun} without an account, until the link ends or you turn it off.</p>
      <div className={`mt-5 grid gap-3 ${editLinks ? 'sm:grid-cols-2' : ''}`}>
        {editLinks && <Select label="People with the link" onChange={setAccess} options={accessOptions} value={access} />}
        <Select label="Link works for" onChange={setDays} options={durationOptions} value={days} />
      </div>
      <div className="mt-1 flex justify-end">
        <button
          className="primary-button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              const created = await auth.request<ShareLink>(`/items/${itemId}/share-links`, {
                method: 'POST',
                body: JSON.stringify({ access, expiresInDays: Number(days) }),
              });
              links.mutate((current) => [created, ...current]);
              return '';
            }, 'Could not create the link')
          }
          type="button"
        >
          Create link
        </button>
      </div>
      <h3 className="mt-6 mb-3 text-base font-medium">Links</h3>
      {links.loading ? (
        <LinesSkeleton label="Loading links" lines={2} />
      ) : links.data?.length ? (
        <ul className="m-0 grid list-none gap-3 p-0">
          {links.data.map((link) => (
            <li className="grid gap-2 rounded-[var(--radius-panel)] border border-line p-3" key={link.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-sm text-ink">
                  {link.access === 'edit' ? 'Can edit' : 'Can view'}
                  <span className="text-faint">
                    {' · Until '}
                    {new Date(link.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </p>
                <button
                  className="text-button text-sm"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await auth.request(`/items/${itemId}/share-links/${link.id}`, { method: 'DELETE' });
                      links.mutate((current) => current.filter((shown) => shown.id !== link.id));
                      return 'The link no longer works.';
                    }, 'Could not turn off the link')
                  }
                  type="button"
                >
                  Turn off
                </button>
              </div>
              {link.link ? (
                <CopyLink link={link.link} />
              ) : (
                <Hint>This older link can’t be shown again. Turn it off and create a new one to copy it.</Hint>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Hint>No links yet. Only members of this space can open this {noun}.</Hint>
      )}
    </Dialog>
  );
}

export function ShareLinks({ editLinks, itemId, noun }: { editLinks: boolean; itemId: string; noun: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="text-button text-sm" onClick={() => setOpen(true)} type="button">
        Share
      </button>
      {open && <ShareDialog editLinks={editLinks} itemId={itemId} noun={noun} onClose={() => setOpen(false)} />}
    </>
  );
}
