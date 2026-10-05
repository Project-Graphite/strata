import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, ListSkeleton } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { SplitEditor } from '../../components/SplitEditor';
import { SubscriptionEditor } from '../../components/SubscriptionEditor';
import type { Member } from '../../spaces';
import { cycleLabel, money, shortDate, type Subscription } from '../../subscriptions';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { SpaceBalances } from './SpaceBalances';
import { useSpace } from './SpaceLayout';
import { LoadError } from '../../components/LoadError';

export function SpaceSubscriptions() {
  const auth = useAuth();
  const space = useSpace();
  const [params] = useSearchParams();
  const cancelled = params.get('status') === 'cancelled';
  const base = `/spaces/${space.id}/recurring`;
  const subscriptions = useResource<Subscription[]>(
    `/spaces/${space.id}/subscriptions${cancelled ? '?status=cancelled' : ''}`,
    true,
  );
  const action = useAction();
  const [editing, setEditing] = useState<Subscription | 'new'>();
  const [splitting, setSplitting] = useState<Subscription>();
  const editable = space.role !== 'viewer';
  const shared = space.kind === 'shared';
  const members = useResource<Member[]>(shared ? `/spaces/${space.id}/members` : null, true);
  const memberName = (userId: string) => members.data?.find((member) => member.userId === userId)?.displayName ?? 'a former member';
  const splitVersion = (subscriptions.data ?? []).map((subscription) => JSON.stringify(subscription.split ?? null)).join();

  function act(subscription: Subscription, verb: 'used' | 'cancel' | 'resume', message: string) {
    void action.run(async () => {
      const updated = await auth.request<Subscription>(`/subscriptions/${subscription.id}/${verb}`, { method: 'POST' });
      subscriptions.mutate((current) =>
        verb === 'used'
          ? current.map((shown) => (shown.id === updated.id ? updated : shown))
          : current.filter((shown) => shown.id !== updated.id),
      );
      return message;
    }, 'Could not update the subscription');
  }

  if (subscriptions.error) return <LoadError error={subscriptions.error} onRetry={subscriptions.reload} />;
  if (!subscriptions.data) return <ListSkeleton label="Loading the subscriptions in this space" rows={4} />;

  return (
    <div className="fade-in grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="mono-sm text-faint" to={cancelled ? base : `${base}?status=cancelled`}>
          {cancelled ? 'Show active' : 'Show cancelled'}
        </Link>
        {editable && !cancelled && (
          <button className="primary-button px-3 py-2 text-sm" onClick={() => setEditing('new')} type="button">
            Add subscription
          </button>
        )}
      </div>
      {shared && !cancelled && <SpaceBalances key={splitVersion} spaceId={space.id} />}
      {subscriptions.data.length === 0 ? (
        <EmptyState title={cancelled ? 'Nothing cancelled' : 'No subscriptions yet'} />
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {subscriptions.data.map((subscription) => (
            <li className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft py-4" key={subscription.id}>
              <div className="min-w-0">
                <p className="m-0 truncate text-ink">
                  {subscription.name} <span className="text-muted">{money(subscription.amountMinor, subscription.currency)}</span>
                </p>
                <p className="mono-sm m-0 mt-1 text-faint">
                  {[
                    cycleLabel(subscription.repeatRule),
                    subscription.category,
                    cancelled ? `cancelled ${shortDate(subscription.cancelledOn!)}` : `renews ${shortDate(subscription.nextRenewal)}`,
                    subscription.trialEndsOn && !cancelled && `trial ends ${shortDate(subscription.trialEndsOn)}`,
                    subscription.paymentLabel,
                    subscription.split && `split · paid by ${memberName(subscription.split.payerId)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {editable && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {cancelled ? (
                    <button className="secondary-button px-3 py-2 text-sm" disabled={action.busy} onClick={() => act(subscription, 'resume', `${subscription.name} is active again.`)} type="button">
                      Resume
                    </button>
                  ) : (
                    <>
                      <button className="secondary-button px-3 py-2 text-sm" onClick={() => setEditing(subscription)} type="button">
                        Edit
                      </button>
                      {shared && members.data && members.data.length > 1 && (
                        <button className="secondary-button px-3 py-2 text-sm" onClick={() => setSplitting(subscription)} type="button">
                          Split
                        </button>
                      )}
                      <button className="secondary-button px-3 py-2 text-sm" disabled={action.busy} onClick={() => act(subscription, 'used', `Noted that you used ${subscription.name}.`)} type="button">
                        I used this
                      </button>
                      <button className="secondary-button px-3 py-2 text-sm" disabled={action.busy} onClick={() => act(subscription, 'cancel', `${subscription.name} is marked cancelled.`)} type="button">
                        Cancelled
                      </button>
                    </>
                  )}
                  {subscription.cancelUrl && !cancelled && (
                    <a className="secondary-button px-3 py-2 text-sm no-underline" href={subscription.cancelUrl} rel="noopener noreferrer" target="_blank">
                      Cancel link
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {splitting && members.data && (
        <SplitEditor
          members={members.data}
          onClose={() => setSplitting(undefined)}
          onSaved={(split) => subscriptions.mutate((current) => current.map((shown) => (shown.id === splitting.id ? { ...shown, split } : shown)))}
          subscription={splitting}
        />
      )}
      {editing && (
        <SubscriptionEditor
          onClose={() => setEditing(undefined)}
          onSaved={(saved) =>
            subscriptions.mutate((current) =>
              current.some((shown) => shown.id === saved.id)
                ? current.map((shown) => (shown.id === saved.id ? saved : shown))
                : [...current, saved].sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal)),
            )
          }
          spaceId={space.id}
          subscription={editing === 'new' ? undefined : editing}
        />
      )}
    </div>
  );
}
