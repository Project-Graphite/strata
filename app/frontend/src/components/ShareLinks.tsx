import { useState } from 'react';
import { ConfirmDialog, Dialog, ListRow, Placeholder, SectionHeading, Select, TextField } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { formatMoment } from '../time';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Copyable } from './Copyable';
import { FormDialog } from './FormDialog';
import { Hint } from './Hint';
import { LoadError } from './LoadError';
import { Button, TextButton } from './Button';
import { PagePeople } from './PagePeople';
import { ButtonSkeleton, HintSkeleton, RowsSkeleton, useRememberedShape } from './Skeletons';

type Access = 'view' | 'edit';

interface ShareLink {
  id: string;
  access: Access;
  slug: string | null;
  expiresAt: string | null;
  createdAt: string;
  link: string | null;
  shortLink: string | null;
}

const accessOptions = [
  { value: 'view' as const, label: 'Can view' },
  { value: 'edit' as const, label: 'Can edit' },
];

const durationOptions = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '1 day' },
  { value: '10080', label: '7 days' },
  { value: '43200', label: '30 days' },
  { value: '525600', label: '1 year' },
  { value: 'never', label: 'Never' },
];

const slugHint = 'Lowercase letters, numbers and dashes. Leave empty for a short random name.';

export function ShareLinks({ editLinks, itemId, noun, onClose, page = false }: { editLinks: boolean; itemId: string; noun: string; onClose: () => void; page?: boolean }) {
  const auth = useAuth();
  const links = useResource<ShareLink[]>(`/items/${itemId}/share-links`, true);
  const action = useAction();
  const renaming = useAction();
  const [access, setAccess] = useState<Access>('view');
  const [minutes, setMinutes] = useState('43200');
  const [slug, setSlug] = useState('');
  const [turningOff, setTurningOff] = useState<ShareLink>();
  const [renamed, setRenamed] = useState<ShareLink>();
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

  if (renamed) {
    return (
      <FormDialog
        busy={renaming.busy}
        busyLabel="Saving…"
        onClose={() => setRenamed(undefined)}
        onSubmit={(target) =>
          void renaming.run(async () => {
            const saved = await auth.request<ShareLink>(`/items/${itemId}/share-links/${renamed.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ slug: String(new FormData(target).get('slug')).trim().toLowerCase() }),
            });
            links.mutate((current) => current.map((shown) => (shown.id === saved.id ? saved : shown)));
            setRenamed(undefined);
            return 'Renamed the link. The old short link no longer works.';
          }, 'Could not rename the link')
        }
        submitLabel="Rename"
        title="Rename this link"
      >
        <TextField autoFocus defaultValue={renamed.slug ?? ''} hint={slugHint} label="Link name" maxLength={40} minLength={3} name="slug" required />
      </FormDialog>
    );
  }

  return (
    <Dialog onClose={onClose} title={`Share ${noun}`}>
      <div className="mt-5 grid gap-5">
        {page && <PagePeople itemId={itemId} />}
        <section aria-label="Anyone with the link" className={`grid gap-3 ${page ? 'border-t border-line pt-5' : ''}`}>
          <SectionHeading action={page && <Hint>This page only</Hint>} level={3} title="Anyone with the link" />
          <div className={`grid grid-cols-1 items-stretch gap-3 ${editLinks ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}>
            {editLinks && <Select label="Access" onChange={setAccess} options={accessOptions} value={access} />}
            <Select label="Expires in" onChange={setMinutes} options={durationOptions} value={minutes} />
            <Button
              disabled={action.busy}
              label={action.busy ? 'Creating…' : 'Create link'}
              onClick={() =>
                void action.run(async () => {
                  const created = await auth.request<ShareLink>(`/items/${itemId}/share-links`, {
                    method: 'POST',
                    body: JSON.stringify({ access, expiresInMinutes: minutes === 'never' ? null : Number(minutes), ...(slug ? { slug } : {}) }),
                  });
                  links.mutate((current) => [created, ...current]);
                  setSlug('');
                  return 'Created the link.';
                }, 'Could not create the link')
              }
            />
          </div>
          <TextField hint={slugHint} label="Link name (optional)" maxLength={40} onChange={(event) => setSlug(event.currentTarget.value.trim().toLowerCase())} value={slug} />
          {links.error ? (
            <LoadError compact error={links.error} onRetry={links.reload} />
          ) : links.loading ? (
            <Placeholder label="Loading links">
              {linkRows ? <RowsSkeleton rows={linkRows} trail={<ButtonSkeleton width="w-24" />} /> : <HintSkeleton />}
            </Placeholder>
          ) : links.data?.length ? (
            <ul className="panel-rows">
              {links.data.map((link) => (
                <ListRow
                  key={link.id}
                  meta={[link.slug && `/s/${link.slug}`, link.expiresAt ? `Expires ${formatMoment(link.expiresAt)}` : 'Never expires'].filter(Boolean).join(' · ')}
                  title={link.access === 'edit' ? 'Can edit' : 'Can view'}
                  trail={
                    <>
                      {link.shortLink ? <Copyable compact value={link.shortLink} /> : link.link ? <Copyable compact value={link.link} /> : <Hint>Link unavailable</Hint>}
                      <TextButton label="Rename" onClick={() => setRenamed(link)} />
                      <TextButton label="Turn off" onClick={() => setTurningOff(link)} />
                    </>
                  }
                />
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
