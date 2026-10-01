import { createHash, randomBytes } from 'node:crypto';

export interface Device {
  hash: string;
  label: string;
}

const browsers: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const systems: Array<[RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

export function deviceLabel(userAgent: string | undefined) {
  const browser = browsers.find(([pattern]) => pattern.test(userAgent ?? ''))?.[1];
  const system = systems.find(([pattern]) => pattern.test(userAgent ?? ''))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}

export function newDeviceId() {
  return randomBytes(32).toString('base64url');
}

export function deviceHash(deviceId: string) {
  return createHash('sha256').update(deviceId).digest('hex');
}
