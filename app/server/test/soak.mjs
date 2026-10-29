import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import * as Y from 'yjs';

const env = process.env;
const base = (env.SOAK_URL ?? 'http://127.0.0.1:4102').replace(/\/$/, '');
const origin = env.SOAK_ORIGIN ?? (env.SOAK_URL ? new URL(base).origin : 'http://localhost:4102');
const clientCount = Number(env.SOAK_CLIENTS ?? 50);
const memberCount = Math.min(clientCount, Number(env.SOAK_MEMBERS ?? Math.ceil(clientCount / 2)));
const runMs = Number(env.SOAK_MINUTES ?? 10) * 60_000;
const gestureEveryMs = Number(env.SOAK_GESTURE_EVERY_MS ?? 3_000);
const addShare = Number(env.SOAK_ADD_SHARE ?? 0.2);
const markerEveryMs = 2_000;
const sampleEveryMs = 5_000;
const syncEveryMs = 200;
const presenceEveryMs = 40;
const gestureSteps = 25;
const boardElementsKey = 'board';
const markerId = 'soak-marker';
const editorFormat = /editorFormat = (\d+)/.exec(readFileSync(new URL('../src/notes/editor-format.ts', import.meta.url), 'utf8'))[1];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, share) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))];
const cookies = new Map();
let accessToken = env.SOAK_ACCESS_TOKEN;
let tokenAt = Date.now();
let renewal;

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    ...(body && { body: JSON.stringify(body) }),
    headers: { origin, 'content-type': 'application/json', ...(accessToken && { authorization: `Bearer ${accessToken}` }), ...(cookies.size && { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }) },
  });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  for (const cookie of response.headers.getSetCookie()) {
    const [name, value] = cookie.split(';')[0].split('=');
    cookies.set(name, value);
  }
  return response.status === 204 ? undefined : response.json();
}

async function signIn(path, body) {
  const session = await api(path, { method: 'POST', body });
  if (!session.accessToken) throw new Error('This account needs a two-step code; pass a signed-in SOAK_ACCESS_TOKEN instead');
  accessToken = session.accessToken;
  tokenAt = Date.now();
}

async function memberToken() {
  if (cookies.size && Date.now() - tokenAt > 10 * 60_000) await (renewal ??= signIn('/auth/refresh').finally(() => (renewal = undefined)));
  return accessToken;
}

const samplers = {
  docker: async (container) => {
    const run = promisify(execFile);
    const { stdout: nanoCpus } = await run('docker', ['inspect', '--format', '{{.HostConfig.NanoCpus}}', container]);
    const units = { B: 2 ** -20, KiB: 2 ** -10, kB: 2 ** -10, MiB: 1, MB: 1, GiB: 1024, GB: 1024 };
    return {
      cpuLimit: Number(nanoCpus) / 1e9 || undefined,
      sample: async () => {
        const { stdout } = await run('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}};{{.MemUsage}}', container]);
        const [cpu, memory] = stdout.trim().split(';');
        const [, amount, unit] = /([\d.]+)\s*(\w+)/.exec(memory);
        return { cpu: parseFloat(cpu), memoryMiB: Number(amount) * units[unit] };
      },
    };
  },
  metrics: async () => {
    let last;
    return {
      sample: async () => {
        const response = await fetch(`${base}/api/v1/metrics`, { headers: { authorization: `Bearer ${env.SOAK_METRICS_TOKEN}` } });
        if (!response.ok) throw new Error(`metrics answered ${response.status}`);
        const text = await response.text();
        const value = (name) => Number(new RegExp(`^${name} (\\S+)`, 'm').exec(text)?.[1]);
        const now = performance.now();
        const cpuSeconds = value('process_cpu_seconds_total');
        const cpu = last ? ((cpuSeconds - last.cpuSeconds) / ((now - last.now) / 1000)) * 100 : undefined;
        last = { now, cpuSeconds };
        return { cpu, memoryMiB: value('process_resident_memory_bytes') / 2 ** 20 };
      },
    };
  },
  none: async () => undefined,
};

const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
const [samplerName, samplerTarget] = (env.SOAK_SAMPLER ?? (env.SOAK_METRICS_TOKEN ? 'metrics' : local ? 'docker:strata-app-1' : 'none')).split(':');
if (!samplers[samplerName]) throw new Error(`SOAK_SAMPLER must be docker:<container>, metrics or none, not ${samplerName}`);
const sampler = await samplers[samplerName](samplerTarget);
const cpuLimit = Number(env.SOAK_CPU_LIMIT) || sampler?.cpuLimit;

if (!accessToken) {
  if (!env.SOAK_EMAIL || !env.SOAK_PASSWORD) throw new Error('Set SOAK_EMAIL and SOAK_PASSWORD, or a signed-in SOAK_ACCESS_TOKEN (personal access tokens cannot open live boards)');
  await signIn('/auth/login', { email: env.SOAK_EMAIL, password: env.SOAK_PASSWORD });
}
let boardId = env.SOAK_BOARD;
if (!boardId) {
  const spaces = await api('/spaces');
  const spaceId = env.SOAK_SPACE ?? (spaces.find((space) => space.kind === 'personal') ?? spaces[0]).id;
  boardId = (await api(`/spaces/${spaceId}/notes`, { method: 'POST', body: { board: true, title: `Realtime soak ${new Date().toISOString()}` } })).id;
}
let shareCode = env.SOAK_SHARE_CODE;
let createdLink;
if (memberCount < clientCount && !shareCode) {
  createdLink = await api(`/items/${boardId}/share-links`, { method: 'POST', body: { access: 'edit', expiresInDays: 1 } });
  shareCode = createdLink.link.split('/').pop();
}

const realtimeUrl = `${base.replace(/^http/, 'ws')}/api/v1/realtime?format=${editorFormat}`;
const created = new Set();
const baseline = new Set();
const latencies = [];
let markersSent = 0;
let running = true;

function element(id, x, y) {
  return {
    id, type: 'rectangle', x, y, width: 120, height: 80, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid',
    roughness: 1, opacity: 100, groupIds: [], frameId: null, index: null, roundness: { type: 3 }, seed: Math.floor(Math.random() * 2 ** 31), version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31), isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: false,
  };
}

function moved(current, x, y) {
  return { ...current, x, y, version: current.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() };
}

function openClient(index, guest) {
  const stats = { index, guest, connects: 0, disconnects: 0, authFailures: 0, closes: new Map(), sent: 0, received: 0, sentBytes: 0, receivedBytes: 0, synced: false, markers: new Set() };
  class CountingSocket extends WebSocket {
    constructor(url, protocols) {
      super(url, protocols, { origin });
      this.on('message', (data) => {
        stats.received += 1;
        stats.receivedBytes += data.byteLength;
      });
    }

    send(data, ...rest) {
      stats.sent += 1;
      stats.sentBytes += data.byteLength;
      super.send(data, ...rest);
    }
  }
  const document = new Y.Doc();
  const elements = document.getMap(boardElementsKey);
  const writer = {};
  const websocketProvider = new HocuspocusProviderWebsocket({ url: realtimeUrl, WebSocketPolyfill: CountingSocket });
  const provider = new HocuspocusProvider({
    name: boardId,
    document,
    websocketProvider,
    flushDelay: 50,
    token: guest ? `share:${shareCode}` : memberToken,
    onAuthenticationFailed: ({ reason }) => {
      stats.authFailures += 1;
      stats.closes.set(`auth: ${reason}`, (stats.closes.get(`auth: ${reason}`) ?? 0) + 1);
    },
    onClose: ({ event }) => {
      const key = `${event.code} ${event.reason}`.trim();
      stats.closes.set(key, (stats.closes.get(key) ?? 0) + 1);
    },
  });
  provider.on('status', ({ status }) => {
    if (status === stats.status) return;
    if (status === 'connected') stats.connects += 1;
    if (status === 'disconnected' && stats.connects > 0) stats.disconnects += 1;
    stats.status = status;
  });
  provider.on('synced', () => {
    if (!stats.synced && index === 0) for (const key of elements.keys()) if (key !== markerId) baseline.add(key);
    stats.synced = true;
    provider.sendStateless('status');
  });
  elements.observe((event, transaction) => {
    stats.changedAt = performance.now();
    if (!stats.synced || transaction.origin === writer || !event.keysChanged.has(markerId)) return;
    const sentAt = elements.get(markerId)?.customData?.sentAt;
    if (sentAt === undefined || stats.markers.has(sentAt)) return;
    stats.markers.add(sentAt);
    latencies.push(performance.now() - sentAt);
  });
  provider.attach();
  provider.setAwarenessField('user', { name: `Soak ${index}`, color: '#6a9eea' });
  const activity = setInterval(() => provider.isSynced && provider.sendStateless('active'), 15_000);

  const write = (value) => {
    document.transact(() => elements.set(value.id, value), writer);
    if (value.id !== markerId) created.add(value.id);
  };

  async function gesture() {
    const keys = [...elements.keys()].filter((key) => key !== markerId);
    const adding = keys.length === 0 || Math.random() < addShare;
    const startX = Math.round(Math.random() * 4_000);
    const startY = Math.round(Math.random() * 3_000);
    let current = adding ? element(`soak-${index}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, startX, startY) : elements.get(keys[Math.floor(Math.random() * keys.length)]);
    const dx = Math.round(Math.random() * 20 - 10);
    const dy = Math.round(Math.random() * 20 - 10);
    let writtenAt = performance.now();
    for (let step = 1; step <= gestureSteps; step += 1) {
      await sleep(presenceEveryMs);
      const x = current.x + dx;
      const y = current.y + dy;
      provider.setAwarenessField('pointer', { x, y, tool: 'pointer', button: 'down' });
      if (adding) continue;
      current = moved(current, x, y);
      if (performance.now() - writtenAt >= syncEveryMs) {
        write(current);
        writtenAt = performance.now();
      }
    }
    write(current);
    provider.setAwarenessField('pointer', { x: current.x, y: current.y, tool: 'pointer', button: 'up' });
  }

  const loop = (async () => {
    while (!stats.synced && running) await sleep(100);
    while (running) {
      await sleep(gestureEveryMs * (0.5 + Math.random()));
      if (running) await gesture();
    }
  })();

  return {
    stats, document, elements, provider, loop, write,
    close() {
      clearInterval(activity);
      provider.destroy();
      websocketProvider.destroy();
    },
  };
}

console.log(`Soak: ${clientCount} clients (${memberCount} members, ${clientCount - memberCount} guests) on board ${boardId} at ${base} for ${runMs / 60_000} min; a gesture every ~${gestureEveryMs} ms per client, ${Math.round(addShare * 100)} % adds; sampler ${samplerName}${samplerTarget ? `:${samplerTarget}` : ''}${cpuLimit ? `, CPU limit ${cpuLimit}` : ''}`);
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
const clients = Array.from({ length: clientCount }, (_, index) => openClient(index, index >= memberCount));
const samples = [];
const startedAt = performance.now();

const sampling = (async () => {
  while (running && sampler) {
    const takenAt = performance.now();
    try {
      const sample = await sampler.sample();
      if (sample.cpu !== undefined) samples.push(sample);
    } catch (error) {
      console.log(`Sample failed: ${error.message}`);
    }
    await sleep(Math.max(0, sampleEveryMs - (performance.now() - takenAt)));
  }
})();

const markers = setInterval(() => {
  const ready = clients.filter((client) => client.provider.isSynced);
  const sender = ready[Math.floor(Math.random() * ready.length)];
  if (!sender) return;
  const current = sender.elements.get(markerId) ?? element(markerId, 0, 0);
  sender.write({ ...moved(current, (current.x + 10) % 1_000, current.y), customData: { sentAt: performance.now() } });
  markersSent += 1;
}, markerEveryMs);

const progress = setInterval(() => {
  const sample = samples.at(-1);
  console.log(`${Math.round((performance.now() - startedAt) / 1000)} s: ${clients.filter((client) => client.provider.isSynced).length}/${clientCount} synced, ${created.size} elements, ${clients.reduce((total, client) => total + client.stats.disconnects, 0)} disconnects, ${latencies.length} marker deliveries${sample ? `, server ${sample.cpu.toFixed(1)} % CPU, ${sample.memoryMiB.toFixed(0)} MiB` : ''}`);
}, 30_000);

await sleep(runMs);
running = false;
clearInterval(markers);
clearInterval(progress);
await Promise.all([...clients.map((client) => client.loop), sampling]);
lag.disable();

const quietSince = performance.now();
while (performance.now() - quietSince < 60_000) {
  const settled = clients.every((client) => client.provider.isSynced && client.provider.unsyncedChanges === 0 && performance.now() - (client.stats.changedAt ?? 0) > 3_000);
  if (settled) break;
  await sleep(250);
}

const digest = (elements) => JSON.stringify([...elements.entries()].filter(([key]) => key !== markerId).map(([key, value]) => [key, value.version, value.versionNonce, value.x, value.y]).sort(([a], [b]) => (a < b ? -1 : 1)));
function compare(elements) {
  const keys = new Set(elements.keys());
  return {
    missing: [...created].filter((id) => !keys.has(id)).length,
    extra: [...keys].filter((id) => id !== markerId && !created.has(id) && !baseline.has(id)).length,
  };
}
const digests = clients.map((client) => digest(client.elements));
const counts = new Map();
for (const value of digests) counts.set(value, (counts.get(value) ?? 0) + 1);
const reference = [...counts].sort((a, b) => b[1] - a[1])[0][0];
const diverged = digests.filter((value) => value !== reference).length;
const comparisons = clients.map((client) => compare(client.elements));
for (const client of clients) client.close();

await sleep(5_000);
const lateJoiner = openClient(clientCount, memberCount === 0);
const joinedAt = performance.now();
while (!lateJoiner.stats.synced && performance.now() - joinedAt < 30_000) await sleep(100);
const persisted = lateJoiner.stats.synced ? { ...compare(lateJoiner.elements), equal: digest(lateJoiner.elements) === reference } : undefined;
lateJoiner.close();
if (createdLink) await api(`/items/${boardId}/share-links/${createdLink.id}`, { method: 'DELETE' });

const total = (key) => clients.reduce((sum, client) => sum + client.stats[key], 0);
const closes = new Map();
for (const client of clients) for (const [reason, count] of client.stats.closes) closes.set(reason, (closes.get(reason) ?? 0) + count);
const disconnects = total('disconnects');
const authFailures = total('authFailures');
const missing = comparisons.reduce((sum, { missing }) => sum + missing, 0);
const extra = comparisons.reduce((sum, { extra }) => sum + extra, 0);
const cpu = samples.map((sample) => sample.cpu);
const cpuOfLimit = (value) => (cpuLimit ? value / cpuLimit : value);
const cpuP95 = cpu.length ? cpuOfLimit(percentile(cpu, 0.95)) : undefined;
const seconds = (performance.now() - startedAt) / 1000;
const line = (label, value) => console.log(`${label.padEnd(30)} ${value}`);

console.log('');
line('Board', boardId);
line('Clients', `${clientCount} (${memberCount} members, ${clientCount - memberCount} guests)`);
line('Disconnects', `${disconnects} (${clients.filter((client) => client.stats.disconnects > 0).length} clients), reconnects ${total('connects') - clientCount}`);
line('Auth failures', authFailures);
line('Close reasons', [...closes].map(([reason, count]) => `${reason} × ${count}`).join(', ') || 'none');
line('Messages sent', `${total('sent')} (${(total('sentBytes') / 2 ** 20).toFixed(1)} MiB, ${(total('sent') / seconds).toFixed(0)}/s)`);
line('Messages received', `${total('received')} (${(total('receivedBytes') / 2 ** 20).toFixed(1)} MiB, ${(total('received') / seconds).toFixed(0)}/s)`);
line('Elements created', `${created.size}, ${baseline.size} already on the board`);
line('Convergence', `${diverged} of ${clientCount} clients differ from the majority; ${missing} missing, ${extra} extra across clients`);
line('Late joiner (persisted)', persisted ? `${persisted.equal ? 'equal' : 'differs'}; ${persisted.missing} missing, ${persisted.extra} extra` : 'did not sync');
line('Marker propagation', latencies.length ? `p50 ${percentile(latencies, 0.5).toFixed(0)} ms, p95 ${percentile(latencies, 0.95).toFixed(0)} ms, max ${Math.max(...latencies).toFixed(0)} ms; ${latencies.length} of ${markersSent * (clientCount - 1)} deliveries` : 'none');
line('Load generator event loop', `p99 ${(lag.percentile(99) / 1e6).toFixed(0)} ms, max ${(lag.max / 1e6).toFixed(0)} ms`);
if (cpu.length) {
  line('Server CPU (% of one core)', `mean ${(cpu.reduce((sum, value) => sum + value, 0) / cpu.length).toFixed(1)}, p50 ${percentile(cpu, 0.5).toFixed(1)}, p95 ${percentile(cpu, 0.95).toFixed(1)}, max ${Math.max(...cpu).toFixed(1)} (${cpu.length} samples)`);
  if (cpuLimit) line(`Server CPU (% of ${cpuLimit} CPU)`, `mean ${cpuOfLimit(cpu.reduce((sum, value) => sum + value, 0) / cpu.length).toFixed(1)}, p95 ${cpuP95.toFixed(1)}, max ${cpuOfLimit(Math.max(...cpu)).toFixed(1)}`);
  const memory = samples.map((sample) => sample.memoryMiB);
  line('Server memory (MiB)', `start ${memory[0].toFixed(0)}, p95 ${percentile(memory, 0.95).toFixed(0)}, max ${Math.max(...memory).toFixed(0)}, end ${memory.at(-1).toFixed(0)}`);
}
const gate = [
  ['no disconnect', disconnects === 0 && authFailures === 0],
  ['no element loss', diverged === 0 && missing === 0 && extra === 0 && Boolean(persisted?.equal) && persisted.missing === 0],
  ...(cpuP95 === undefined ? [] : [[`server CPU p95 < 60 %${cpuLimit ? ' of the limit' : ''}`, cpuP95 < 60]]),
];
line('Gate', gate.map(([label, passed]) => `${label}: ${passed ? 'pass' : 'FAIL'}`).join('; '));
process.exitCode = gate.every(([, passed]) => passed) ? 0 : 1;
