import { useEffect, useState } from 'react';
import { errorMessage, Toggle } from '@project-graphite/ui';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { LoadError } from './LoadError';
import { RowText } from './RowText';
import { allPushKinds, pushGroups, pushRegistration, savePush, turnOffPush, turnOnPush } from '../push';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

interface Device {
  registration: ServiceWorkerRegistration;
  subscription: PushSubscription | null;
  kinds: string[] | null;
}

export function DevicePush() {
  const { request } = useAuth();
  const key = useResource<{ publicKey: string | null }>('/push/key', true);
  const acting = useAction();
  const [device, setDevice] = useState<Device | null>();
  const [checkError, setCheckError] = useState('');
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    void (async () => {
      const registration = await pushRegistration();
      if (!registration) return setDevice(null);
      const subscription = await registration.pushManager.getSubscription();
      const kinds = subscription
        ? await request<{ kinds: string[] }>('/me/push-subscriptions/find', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }).then(
            (found) => found.kinds,
            (error: unknown) => {
              if (error instanceof ApiError && error.status === 404) return null;
              throw error;
            },
          )
        : null;
      setDevice({ registration, subscription, kinds });
    })().catch((reason: unknown) => setCheckError(errorMessage(reason, 'Could not check this device')));
  }, [request, checks]);

  const note = (text: string) => (
    <div className="panel-rows">
      <div className="panel-row">
        <RowText detail={text} title="Notifications on this device" />
      </div>
    </div>
  );
  if (key.error || checkError) {
    return (
      <LoadError
        compact
        error={key.error || checkError}
        onRetry={
          key.error
            ? key.reload
            : () => {
                setCheckError('');
                setChecks((current) => current + 1);
              }
        }
      />
    );
  }
  if (key.data?.publicKey === null) return note('Not set up on this server yet.');
  if (device === null) return note('This browser cannot show notifications from Strata. Install Strata as an app, or use a recent Chrome, Edge, Firefox or Safari.');
  if (!device || !key.data) return null;
  const { registration, subscription, kinds } = device;
  const publicKey = key.data.publicKey;

  function choose(group: string[], on: boolean) {
    const next = on ? [...new Set([...kinds!, ...group])] : kinds!.filter((kind) => !group.includes(kind));
    void acting.run(async () => {
      setDevice({ ...device!, kinds: (await savePush(request, subscription!, next)).kinds });
      return '';
    }, 'Could not change the notifications');
  }

  return (
    <div className="panel-rows">
      <Toggle
        checked={kinds !== null}
        description="Shows inbox notices on this device, even when Strata is closed."
        disabled={acting.busy}
        label="Notifications on this device"
        onChange={(on) =>
          void acting.run(async () => {
            if (on) {
              const saved = await turnOnPush(request, registration, publicKey, allPushKinds);
              setDevice({ registration, subscription: await registration.pushManager.getSubscription(), kinds: saved.kinds });
              return 'Notifications are on for this device.';
            }
            if (subscription) await turnOffPush(request, subscription);
            setDevice({ registration, subscription: null, kinds: null });
            return 'Notifications are off for this device.';
          }, 'Could not change the notifications')
        }
      />
      {kinds !== null &&
        pushGroups.map((group) => (
          <Toggle
            checked={group.kinds.every((kind) => kinds.includes(kind))}
            disabled={acting.busy}
            key={group.label}
            label={group.label}
            onChange={(on) => choose(group.kinds, on)}
          />
        ))}
    </div>
  );
}
