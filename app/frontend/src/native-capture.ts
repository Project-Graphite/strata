import { Capacitor, registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';

export type DigitalAppId = 'instapay' | 'nsave' | 'paypal';

export interface DigitalAppOption {
  id: DigitalAppId;
  label: 'InstaPay' | 'nSave' | 'PayPal';
  hint: string;
}

export const digitalAppOptions: DigitalAppOption[] = [
  {
    id: 'instapay',
    label: 'InstaPay',
    hint: 'Instant transfers and IPN notifications',
  },
  {
    id: 'nsave',
    label: 'nSave',
    hint: 'Card spend, transfers and multi-currency deposits',
  },
  {
    id: 'paypal',
    label: 'PayPal',
    hint: 'Online payments, transfers and refunds',
  },
];

export interface CapturePreferences {
  allowedChats: string[];
  enabledApps: DigitalAppId[];
}

export interface FinanceApp {
  packageName: string;
  label: string;
  group: 'Banks' | 'Wallets' | 'Apps';
}

export interface NativeCaptureStatus {
  notificationsGranted: boolean;
  smsBackfillAvailable: boolean;
  smsGranted: boolean;
  configured: boolean;
  needsReconnect: boolean;
  endpointUrl: string;
  tokenExpiresAt: string;
  allowedChats: string[];
  enabledPackages: string[];
  installedApps: FinanceApp[];
  queuedCount: number;
  rejectedCount: number;
  evictedCount: number;
  lastError: string;
}

export interface StrataCapturePlugin {
  getStatus(): Promise<NativeCaptureStatus>;
  configure(options: { endpointUrl: string; token?: string; tokenExpiresAt?: string; allowedChats: string[]; enabledPackages: string[] }): Promise<NativeCaptureStatus>;
  openNotificationSettings(): Promise<void>;
  scanNotifications(): Promise<{ scanned: number; forwarded: number }>;
  requestSmsAccess(): Promise<void>;
  backfillInbox(): Promise<{ scanned: number; queued: number }>;
  flushOutbox(): Promise<{ sent: number; remaining: number }>;
  retryRejected(): Promise<NativeCaptureStatus>;
  takeShare(): Promise<{ title?: string; text?: string; url?: string; files?: { name: string; type: string; data: string }[] }>;
}

export const StrataCapture = registerPlugin<StrataCapturePlugin>('StrataCapture');

const serverOriginKey = 'strata-server-origin';
const prefsPrefix = 'strata-capture-prefs:';
const defaultServerOrigin = 'https://strata.project-graphite.com';
const renewWithinMs = 14 * 24 * 60 * 60 * 1000;

export const androidReleaseUrl = 'https://github.com/Project-Graphite/strata/releases/latest/download/strata.apk';
export const androidReleasesPageUrl = 'https://github.com/Project-Graphite/strata/releases/latest';

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function serverOrigin() {
  if (!Capacitor.isNativePlatform()) return window.location.origin;
  try {
    return (localStorage.getItem(serverOriginKey) ?? defaultServerOrigin).replace(/\/+$/, '');
  } catch {
    return defaultServerOrigin;
  }
}

export function apiUrl(path: string) {
  return Capacitor.isNativePlatform() ? `${serverOrigin()}/api/v1${path}` : `/api/v1${path}`;
}

export function parseChatList(value: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

export function loadCapturePreferences(spaceId: string, accountSenders: string[] = []): CapturePreferences {
  const defaultChats = [...new Set(accountSenders.map((sender) => sender.trim()).filter(Boolean))];
  const defaultApps: DigitalAppId[] = ['instapay', 'nsave', 'paypal'];
  try {
    const raw = localStorage.getItem(`${prefsPrefix}${spaceId}`);
    if (!raw) return { allowedChats: defaultChats, enabledApps: defaultApps };
    const parsed = JSON.parse(raw) as Partial<CapturePreferences>;
    const allowedChats = Array.isArray(parsed.allowedChats)
      ? [...new Set([...parsed.allowedChats.map((chat) => String(chat).trim()).filter(Boolean), ...defaultChats])]
      : defaultChats;
    const enabledApps = Array.isArray(parsed.enabledApps)
      ? parsed.enabledApps.filter((app): app is DigitalAppId => digitalAppOptions.some((option) => option.id === app))
      : defaultApps;
    return { allowedChats, enabledApps };
  } catch {
    return { allowedChats: defaultChats, enabledApps: defaultApps };
  }
}

export function saveCapturePreferences(spaceId: string, prefs: CapturePreferences) {
  try {
    localStorage.setItem(`${prefsPrefix}${spaceId}`, JSON.stringify(prefs));
  } catch {
    return;
  }
}

export function combinedAllowedSources(allowedChats: string[], enabledApps: DigitalAppId[]) {
  const appLabels = digitalAppOptions.filter((option) => enabledApps.includes(option.id)).map((option) => option.label);
  return [...new Set([...allowedChats.map((chat) => chat.trim()).filter(Boolean), ...appLabels])];
}

export function phoneCaptureAttention(status: NativeCaptureStatus) {
  if (!status.configured) return null;
  if (status.needsReconnect) return 'reconnect';
  if (status.tokenExpiresAt && Date.parse(status.tokenExpiresAt) - Date.now() < renewWithinMs) return 'renew';
  if (status.allowedChats.length === 0 && status.enabledPackages.length === 0) return 'paused';
  return null;
}

export function useNativeCaptureStatus() {
  const nativeAndroid = isNativeAndroid();
  const [status, setStatus] = useState<NativeCaptureStatus | null>(null);

  const refresh = useCallback(() => {
    if (!nativeAndroid) return;
    void StrataCapture.getStatus().then(setStatus);
  }, [nativeAndroid]);

  useEffect(() => {
    if (!nativeAndroid) return;
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [nativeAndroid, refresh]);

  return { status, setStatus, refresh };
}
