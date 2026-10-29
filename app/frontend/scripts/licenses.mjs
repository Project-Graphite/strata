import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const manifestOf = (directory) => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
const visited = new Set();
const packages = new Map();

function locate(name, from) {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dirname(directory) === directory) return undefined;
  }
}

function licenseOf({ license, licenses }) {
  if (typeof license === 'string') return license;
  if (license?.type) return license.type;
  return Array.isArray(licenses) && licenses.length ? licenses.map((entry) => entry.type ?? entry).join(' OR ') : null;
}

function linkOf({ homepage, repository }) {
  const source = (typeof repository === 'string' ? repository : repository?.url)
    ?.replace(/^(github|gitlab|bitbucket):/, (_, host) => `https://${host}.${host === 'bitbucket' ? 'org' : 'com'}/`)
    .replace(/^([\w.-]+\/[\w.-]+)$/, 'https://github.com/$1')
    .replace(/^git\+/, '')
    .replace(/^(?:ssh:\/\/)?git@([^:/]+)[:/]/, 'https://$1/')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
  return [source, homepage].find((url) => /^https?:\/\//.test(url ?? '')) ?? null;
}

function visit(name, from) {
  const directory = locate(name, from);
  if (!directory || visited.has(directory)) return;
  visited.add(directory);
  const manifest = manifestOf(directory);
  packages.set(`${manifest.name}@${manifest.version}`, { name: manifest.name, version: manifest.version, license: licenseOf(manifest), url: linkOf(manifest) });
  const optionalPeers = Object.entries(manifest.peerDependenciesMeta ?? {}).filter(([, meta]) => meta.optional).map(([peer]) => peer);
  const peers = Object.keys(manifest.peerDependencies ?? {}).filter((peer) => !optionalPeers.includes(peer));
  for (const dependency of new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {}), ...peers])) {
    visit(dependency, directory);
  }
}

for (const dependency of Object.keys(manifestOf(frontend).dependencies)) visit(dependency, frontend);

const list = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
writeFileSync(join(frontend, 'public', 'licenses.json'), JSON.stringify(list));
console.log(`Wrote ${list.length} package licenses to public/licenses.json`);
