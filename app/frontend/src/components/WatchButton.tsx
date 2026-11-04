import { Button as UiButton } from '@project-graphite/ui';
import { useAuth } from '../auth';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

interface WatchStatus {
  watching: boolean;
  watchers: { id: string; displayName: string }[];
}

export function WatchButton({ itemId }: { itemId: string }) {
  const auth = useAuth();
  const action = useAction();
  const status = useResource<WatchStatus>(`/items/${itemId}/watchers`, true, { live: ['task-details', 'page-details'], itemIds: [itemId] });
  if (!status.data) return null;
  const { watching, watchers } = status.data;
  const names = watchers.map((watcher) => watcher.displayName).join(', ');
  return (
    <UiButton
      aria-label={`${watching ? 'Stop watching' : 'Watch'}. ${watchers.length} watching`}
      aria-pressed={watching}
      disabled={action.busy}
      icon="bell"
      onClick={() =>
        void action.run(async () => {
          const next = await auth.request<WatchStatus>(`/items/${itemId}/watch`, { method: watching ? 'DELETE' : 'PUT' });
          status.mutate(() => next);
          return watching ? 'You stopped watching this.' : 'You are watching this and will hear about every change.';
        }, 'Could not change watching')
      }
      size="small"
      title={names ? `Watching: ${names}` : 'Nobody is watching this yet'}
      type="button"
      variant="secondary"
    >
      {watching ? 'Watching' : 'Watch'} · {watchers.length}
    </UiButton>
  );
}
