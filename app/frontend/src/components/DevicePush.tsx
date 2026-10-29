import { useEffect, useState } from 'react';
import { errorMessage, ListRow, Placeholder, Toggle } from '@project-graphite/ui';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { LoadError } from './LoadError';
import { RowSkeleton, ToggleSkeleton, useRememberedShape } from './Skeletons';
import { allPushKinds, pushRegistration, turnOffPush, turnOnPush } from '../push';
import { useAction } from '../useAction';
import { useResource } from '../useResource';

interface Device {
  registration: ServiceWorkerRegistration;
  subscription: PushSubscription | null;
  kinds: string[] | null;
}

const useDevicePushShape = (shape?: [number]) => useRememberedShape('device-push', shape, [1]);

export function DevicePushSkeleton() {
  const [toggle] = useDevicePushShape();
  return toggle ? (
    <div aria-hidden="true" className="panel-rows">
      <ToggleSkeleton description />
    </div>
  ) : (
    <ul aria-hidden="true" className="panel-rows">
      <RowSkeleton />
    </ul>
  );
}

export function DevicePush() {
  const { request } = useAuth();
  const key = useResource<{ publicKey: string | null }>('/push/key', true);
  const acting = useAction();
  const [device, setDevice] = useState<Device | null>();
  const [checkError, setCheckError] = useState('');
  const [checks, setChecks] = useState(0);
  useDevicePushShape(key.data && device !== undefined ? [key.data.publicKey === null || device === null ? 0 : 1] : undefined);

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
    <ul className="panel-rows">
      <ListRow meta={text} title="Notifications on this device" />
    </ul>
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
  if (device === undefined || !key.data) {
    return (
      <Placeholder label="Checking notifications on this device">
        <DevicePushSkeleton />
      </Placeholder>
    );
  }
  if (key.data.publicKey === null) return note('Not set up on this server yet.');
  if (device === null) return note('This browser cannot show notifications from Strata. Install Strata as an app, or use a recent Chrome, Edge, Firefox or Safari.');
  const { registration, subscription, kinds } = device;
  const publicKey = key.data.publicKey;

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
    </div>
  );
}
