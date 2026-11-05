import { useEffect, useState } from 'react';
import { errorMessage, ListRow, Placeholder } from '@project-graphite/ui';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { LoadError } from './LoadError';
import { RowSkeleton, ToggleSkeleton, useRememberedShape } from './Skeletons';
import { allPushKinds, pushRegistration, savePush, turnOffPush, turnOnPush } from '../push';
import { useAction } from '../useAction';
import { useResource } from '../useResource';
import { Toggle } from './Toggle';

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

export function useDevicePush() {
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

  const error = key.error || checkError;
  const retry = key.error
    ? key.reload
    : () => {
        setCheckError('');
        setChecks((current) => current + 1);
      };
  const ready = Boolean(device && key.data?.publicKey);
  const kinds = device?.kinds ?? null;

  function turn(on: boolean) {
    if (!device || !key.data?.publicKey) return;
    const { registration, subscription } = device;
    const publicKey = key.data.publicKey;
    void acting.run(async () => {
      if (on) {
        const saved = await turnOnPush(request, registration, publicKey, allPushKinds);
        setDevice({ registration, subscription: await registration.pushManager.getSubscription(), kinds: saved.kinds });
        return 'Notifications are on for this device.';
      }
      if (subscription) await turnOffPush(request, subscription);
      setDevice({ registration, subscription: null, kinds: null });
      return 'Notifications are off for this device.';
    }, 'Could not change the notifications');
  }

  async function saveKinds(next: string[]) {
    if (!device?.subscription) return;
    const before = device;
    setDevice({ ...device, kinds: next });
    try {
      const saved = await savePush(request, device.subscription, next);
      setDevice({ ...before, kinds: saved.kinds });
    } catch (reason) {
      setDevice(before);
      throw reason;
    }
  }

  return { busy: acting.busy, checking: !error && (device === undefined || !key.data), device, error, kinds, ready, retry, saveKinds, supported: device !== null, configured: key.data?.publicKey !== null, turn };
}

export function DevicePush({ push }: { push: ReturnType<typeof useDevicePush> }) {
  const note = (text: string) => (
    <ul className="panel-rows">
      <ListRow meta={text} title="Notifications on this device" />
    </ul>
  );
  if (push.error) return <LoadError compact error={push.error} onRetry={push.retry} />;
  if (push.checking) {
    return (
      <Placeholder label="Checking notifications on this device">
        <DevicePushSkeleton />
      </Placeholder>
    );
  }
  if (!push.configured) return note('Not set up on this server yet.');
  if (!push.supported) return note('This browser cannot show notifications from Strata. Install Strata as an app, or use a recent Chrome, Edge, Firefox or Safari.');
  return (
    <div className="panel-rows">
      <Toggle checked={push.kinds !== null} description="Shows notifications on this device, even when Strata is closed." disabled={push.busy} label="Notifications on this device" onChange={push.turn} />
    </div>
  );
}
