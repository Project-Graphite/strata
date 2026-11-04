import { ApiError } from './api';

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export const allPushKinds = [
  'task_due',
  'task_assigned',
  'event_soon',
  'birthday',
  'subscription_due',
  'budget_alert',
  'payment_due',
  'comment',
  'invitation',
  'member_joined',
  'role_changed',
  'removed_from_space',
  'weekly_review',
  'tidy_summary',
  'watching',
];

const keyBytes = (key: string) =>
  Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4)), (character) => character.charCodeAt(0));

export async function pushRegistration() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

export function savePush(request: Request, subscription: PushSubscription, kinds: string[]) {
  const { endpoint, keys } = subscription.toJSON();
  return request<{ kinds: string[] }>('/me/push-subscriptions', { method: 'PUT', body: JSON.stringify({ endpoint, keys, kinds }) });
}

export async function turnOnPush(request: Request, registration: ServiceWorkerRegistration, publicKey: string, kinds: string[]) {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for Strata in this browser. Allow them in the site settings, then try again.');
  const subscription =
    (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  return savePush(request, subscription, kinds);
}

export async function syncPushKinds(request: Request) {
  const subscription = await (await pushRegistration())?.pushManager.getSubscription();
  if (!subscription) return;
  const found = await request<{ kinds: string[] }>('/me/push-subscriptions/find', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (found && allPushKinds.some((kind) => !found.kinds.includes(kind))) await savePush(request, subscription, allPushKinds);
}

export async function turnOffPush(request: Request, subscription: PushSubscription) {
  await request('/me/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  await subscription.unsubscribe();
}
