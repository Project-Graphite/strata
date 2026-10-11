type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export const pushGroups = [
  { label: 'Tasks that are due or assigned to you', kinds: ['task_due', 'task_assigned'] },
  { label: 'Events about to start', kinds: ['event_soon'] },
  { label: 'Renewals and trials ending', kinds: ['subscription_due'] },
  { label: 'Comments on your pages', kinds: ['comment'] },
  { label: 'Invitations and changes to your spaces', kinds: ['invitation', 'member_joined', 'role_changed', 'removed_from_space'] },
  { label: 'Weekly review and Tidy summary', kinds: ['weekly_review', 'tidy_summary'] },
];

export const allPushKinds = pushGroups.flatMap((group) => group.kinds);

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

export async function turnOffPush(request: Request, subscription: PushSubscription) {
  await request('/me/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  await subscription.unsubscribe();
}
