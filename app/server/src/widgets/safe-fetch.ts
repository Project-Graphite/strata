import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export class UnsafeUrlError extends Error {}

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 127],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isPublicAddress(mapped);
  const family = isIP(address);
  return family !== 0 && !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

export function checkedUrl(text: string) {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UnsafeUrlError('That is not a web address');
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https:// addresses are allowed');
  if (url.username || url.password) throw new UnsafeUrlError('Addresses with a user name or password are not allowed');
  if (url.port && url.port !== '443') throw new UnsafeUrlError('Only the standard https port is allowed');
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && !isPublicAddress(literal)) throw new UnsafeUrlError('That address points to a private network');
  return url;
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true }).then(
    (addresses) => {
      if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) {
        callback(new UnsafeUrlError('That address points to a private network'), '', 0);
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0]!.address, addresses[0]!.family);
    },
    (error: NodeJS.ErrnoException) => callback(error, '', 0),
  );
};

export interface SafeFetchOptions {
  accept: string;
  maxBytes: number;
  timeoutMs: number;
  redirects?: number;
}

export async function fetchPublic(text: string, options: SafeFetchOptions): Promise<string> {
  const url = checkedUrl(text);
  return new Promise<string>((resolve, reject) => {
    const outgoing = request(
      url,
      {
        headers: { Accept: options.accept, 'User-Agent': 'Strata feed reader (+https://strata.project-graphite.com)' },
        lookup: guardedLookup,
        timeout: options.timeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          const redirects = options.redirects ?? 3;
          if (redirects === 0) {
            reject(new UnsafeUrlError('That address redirects too many times'));
            return;
          }
          fetchPublic(new URL(response.headers.location, url).toString(), { ...options, redirects: redirects - 1 }).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`The address answered with status ${status}`));
          return;
        }
        if (Number(response.headers['content-length'] ?? 0) > options.maxBytes) {
          response.destroy();
          reject(new Error('That address returned too much data'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            response.destroy();
            reject(new Error('That address returned too much data'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', reject);
      },
    );
    const deadline = setTimeout(() => outgoing.destroy(new Error('That address took too long to answer')), options.timeoutMs);
    outgoing.on('close', () => clearTimeout(deadline));
    outgoing.on('timeout', () => outgoing.destroy(new Error('That address took too long to answer')));
    outgoing.on('error', reject);
    outgoing.end();
  });
}

export function postPublic(text: string, body: string, headers: Record<string, string>, timeoutMs: number) {
  const url = checkedUrl(text);
  return new Promise<number>((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
          'User-Agent': 'Strata webhooks (+https://strata.project-graphite.com)',
          ...headers,
        },
        lookup: guardedLookup,
        timeout: timeoutMs,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    const deadline = setTimeout(() => outgoing.destroy(new Error('That address took too long to answer')), timeoutMs);
    outgoing.on('close', () => clearTimeout(deadline));
    outgoing.on('timeout', () => outgoing.destroy(new Error('That address took too long to answer')));
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
