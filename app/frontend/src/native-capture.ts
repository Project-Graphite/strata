import { Capacitor, registerPlugin } from '@capacitor/core';

export type DigitalAppId = 'instapay' | 'nsave' | 'paypal';

export interface DigitalAppOption {
  id: DigitalAppId;
  label: 'InstaPay' | 'nSave' | 'PayPal';
  packages: string[];
  hint: string;
}

export const digitalAppOptions: DigitalAppOption[] = [
  {
    id: 'instapay',
    label: 'InstaPay',
    packages: ['com.egyptianbanks.instapay'],
    hint: 'Instant transfers and IPN notifications',
  },
  {
    id: 'nsave',
    label: 'nSave',
    packages: ['com.nsave.app', 'tech.nsave.app'],
    hint: 'Card spend, transfers and multi-currency deposits',
  },
  {
    id: 'paypal',
    label: 'PayPal',
    packages: ['com.paypal.android.p2pmobile'],
    hint: 'Online payments, transfers and refunds',
  },
];

export interface CapturePreferences {
  allowedChats: string[];
  enabledApps: DigitalAppId[];
}

export interface NativeCaptureStatus {
  smsGranted: boolean;
  notificationsGranted: boolean;
  configured: boolean;
  allowedChats: string[];
  enabledApps: DigitalAppId[];
  queuedCount: number;
}

export interface StrataCapturePlugin {
  getStatus(): Promise<NativeCaptureStatus>;
  configure(options: {
    endpointUrl: string;
    token?: string;
    allowedChats: string[];
    enabledApps: DigitalAppId[];
    enabledPackages: string[];
  }): Promise<NativeCaptureStatus>;
  requestSmsPermissions(): Promise<{ granted: boolean }>;
  openNotificationSettings(): Promise<void>;
  syncInboxSms(options?: { allowedChats?: string[]; limit?: number; sinceStamp?: number }): Promise<{ scanned: number; forwarded: number }>;
  flushOutbox(): Promise<{ sent: number; remaining: number }>;
}

export const StrataCapture = registerPlugin<StrataCapturePlugin>('StrataCapture');

const serverOriginKey = 'strata-server-origin';
const prefsPrefix = 'strata-capture-prefs:';
const defaultServerOrigin = 'https://strata.project-graphite.com';

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

export function packagesForApps(enabledApps: DigitalAppId[]) {
  return digitalAppOptions.filter((option) => enabledApps.includes(option.id)).flatMap((option) => option.packages);
}

export function combinedAllowedSources(allowedChats: string[], enabledApps: DigitalAppId[]) {
  const appLabels = digitalAppOptions.filter((option) => enabledApps.includes(option.id)).map((option) => option.label);
  return [...new Set([...allowedChats.map((chat) => chat.trim()).filter(Boolean), ...appLabels])];
}

