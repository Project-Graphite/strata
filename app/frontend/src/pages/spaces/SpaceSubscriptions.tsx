import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ListRow, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { Empty } from '../../components/Empty';
import { AmountRowsSkeleton, ButtonSkeleton, IconButtonSkeleton, useRememberedShape } from '../../components/Skeletons';
import { SplitEditor } from '../../components/SplitEditor';
import { SubscriptionEditor } from '../../components/SubscriptionEditor';
import type { Member } from '../../spaces';
import { cycleLabel, shortDate, type Subscription } from '../../subscriptions';
import { useAction } from '../../useAction';
import { useResource } from '../../useResource';
import { useSpace } from './SpaceLayout';
import { LoadError } from '../../components/LoadError';
import { FilterChips, Toolbar } from '../../components/Page';

export function SpaceSubscriptions() {
  const auth = useAuth();
  const space = useSpace();
  const [params, setParams] = useSearchParams();
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
  const linked = editable ? subscriptions.data?.find((subscription) => subscription.id === params.get('subscription')) : undefined;
  const opened = editing ?? linked;
  const [rows] = useRememberedShape(`space-subscriptions-${space.id}${cancelled ? '-cancelled' : ''}`, subscriptions.data && [subscriptions.data.length], [4]);
  const empty = cancelled
    ? { title: 'No cancelled subscriptions', hint: 'Subscriptions you mark cancelled show up here, ready to resume.' }
    : { title: 'No subscriptions yet', hint: 'Add the subscriptions and bills this space pays to see each renewal coming.' };
  const close = () => {
    setEditing(undefined);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('subscription');
      return next;
    });
  };

  function act(subscription: Subscription, verb: 'used' | 'cancel' | 'resume', message: string) {
    void action.run(async () => {
      const updated = await auth.request<Subscription>(`/subscriptions/${subscription.id}/${verb}`, { method: 'POST' });
      subscriptions.mutate((current) =>
        verb === 'used'
          ? current.map((shown) => (shown.id === updated.id ? updated : shown))
          : current.filter((shown) => shown.id !== updated.id),
      );
      return verb === 'cancel'
        ? {
            message,
            undo: async () => {
              await auth.request(`/subscriptions/${subscription.id}/resume`, { method: 'POST' });
              subscriptions.reload();
              return '';
            },
          }
        : message;
    }, 'Could not update the subscription');
  }

  return (
    <>
      <Toolbar actions={editable && <Button icon="plus" label="New subscription" onClick={() => setEditing('new')} />}>
        <FilterChips
          items={[
            { active: !cancelled, href: base, label: 'Active' },
            { active: cancelled, href: `${base}?status=cancelled`, label: 'Cancelled' },
          ]}
          label="Subscriptions"
        />
      </Toolbar>
      {subscriptions.error ? (
        <LoadError error={subscriptions.error} onRetry={subscriptions.reload} />
      ) : !subscriptions.data ? (
        <Placeholder label="Loading the subscriptions in this space">
          {rows ? (
            <AmountRowsSkeleton rows={rows} trail={editable && (cancelled ? <ButtonSkeleton width="w-20" /> : <IconButtonSkeleton />)} />
          ) : (
            <Empty loading title={empty.title}>
              {empty.hint}
            </Empty>
          )}
        </Placeholder>
      ) : subscriptions.data.length === 0 ? (
        <Empty title={empty.title}>{empty.hint}</Empty>
      ) : (
        <ul className="panel-rows">
          {subscriptions.data.map((subscription) => (
            <ListRow
              key={subscription.id}
              meta={[
                cycleLabel(subscription.repeatRule),
                subscription.category,
                cancelled ? `cancelled ${shortDate(subscription.cancelledOn!)}` : `renews ${shortDate(subscription.nextRenewal)}`,
                subscription.trialEndsOn && !cancelled && `trial ends ${shortDate(subscription.trialEndsOn)}`,
                subscription.paymentLabel,
                subscription.split && `split · paid by ${memberName(subscription.split.payerId)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              onClick={editable ? () => setEditing(subscription) : undefined}
              title={subscription.name}
              trail={
                <>
                  <Amount currency={subscription.currency} minor={subscription.amountMinor} />
                  {editable &&
                    (cancelled ? (
                      <Button disabled={action.busy} label="Resume" onClick={() => act(subscription, 'resume', `Resumed ${subscription.name}.`)} />
                    ) : (
                      <ActionsMenu
                        items={[
                          ...(shared && members.data && members.data.length > 1 ? [{ label: 'Split', onSelect: () => setSplitting(subscription) }] : []),
                          { label: 'I used this', onSelect: () => act(subscription, 'used', `Noted that you used ${subscription.name}.`) },
                          { label: 'Mark cancelled', onSelect: () => act(subscription, 'cancel', `Marked ${subscription.name} cancelled.`) },
                          ...(subscription.cancelUrl ? [{ label: 'Cancel link', href: subscription.cancelUrl, separated: true }] : []),
                        ]}
                        name={subscription.name}
                      />
                    ))}
                </>
              }
            />
          ))}
        </ul>
      )}
      {splitting && members.data && (
        <SplitEditor
          item={splitting}
          members={members.data}
          onClose={() => setSplitting(undefined)}
          onSaved={(split) => subscriptions.mutate((current) => current.map((shown) => (shown.id === splitting.id ? { ...shown, split } : shown)))}
        />
      )}
      {opened && (
        <SubscriptionEditor
          onClose={close}
          onSaved={(saved) =>
            subscriptions.mutate((current) =>
              current.some((shown) => shown.id === saved.id)
                ? current.map((shown) => (shown.id === saved.id ? saved : shown))
                : [...current, saved].sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal)),
            )
          }
          spaceId={space.id}
          subscription={opened === 'new' ? undefined : opened}
        />
      )}
    </>
  );
}
