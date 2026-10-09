import { Popover, timeAgo } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { CopyLink } from './CopyLink';

interface ShareLink {
  id: string;
  access: string;
  expiresAt: string;
  createdAt: string;
  link?: string;
}

export function ShareLinks({ itemId, noun }: { itemId: string; noun: string }) {
  const auth = useAuth();
  const links = useResource<ShareLink[]>(`/items/${itemId}/share-links`, true);
  const action = useAction();

  return (
    <Popover label={`Share this ${noun}`} panelClassName="share-panel" trigger="Share" triggerClassName="text-button text-sm" triggerLabel={`Share this ${noun}`}>
      {() => (
        <div className="grid gap-3">
          <p className="m-0 text-sm text-muted">Anyone with a view link can read this {noun} for 30 days, without an account.</p>
          {(links.data ?? []).map((link) => (
            <div className="grid gap-1.5" key={link.id}>
              {link.link ? <CopyLink link={link.link} /> : <p className="mono-sm m-0 text-faint">View link made {timeAgo(link.createdAt)}</p>}
              <button
                className="text-button w-fit text-sm"
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
          ))}
          <button
            className="secondary-button w-fit px-3 py-2 text-sm"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                const created = await auth.request<ShareLink>(`/items/${itemId}/share-links`, { method: 'POST', body: JSON.stringify({ access: 'view', expiresInDays: 30 }) });
                links.mutate((current) => [created, ...current]);
                return '';
              }, 'Could not create the link')
            }
            type="button"
          >
            Create a view link
          </button>
        </div>
      )}
    </Popover>
  );
}
