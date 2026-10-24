$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
@'
(async () => {
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { ItemKind, SpaceRole, ShareAccess } = require('@prisma/client');
const Y = require('yjs');
const { RealtimeService } = require('./dist/realtime/realtime.service.js');
const { linkTokenHash } = require('./dist/crypto/link-token.js');
const { readPageDraft } = require('./dist/notes/page-draft.js');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = { id: 'page', spaceId: 'space', title: 'Original title', kind: 'note', parentId: null, position: 1, icon: null, pinnedAt: null, template: false, quick: false, database: true, journal: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), editable: true, permissions: { edit: true, comment: true, share: true, organize: true, history: true, spaceRole: 'owner', pageRole: null }, path: [], row: null };
let schema = { revision: new Date().toISOString(), properties: [{ id: 'text', name: 'Text', type: 'text' }], view: 'table', groupBy: null, dateBy: null };
let rowValue = 'Original value';
let failDetails = false;
let failSaves = false;
let viewOnlyMember = false;
let offlineRealtime = false;
let realtimeUpgrades = 0;
let nextDetailsDelay = 0;
let detailsRequests = 0;
const navigationRequests = [];
const fixtureJwt = new JwtService({ secret: 'browser-fixture-secret' });
const issuedTokens = new Map();
const refreshRequests = new Map();
let tokenSequence = 0;
let failRenewals = 0;
let renewalFailures = 0;
let renewalFailedAt = 0;
let renewalResumedAt = 0;
let guestBoardRequests = 0;
let treeParentHidden = false;
let nestedParentId = 'old-600';
const embeddedBoardId = '00000000-0000-4000-8000-000000000001';
const treeMoves = [];
const indexedLinks = new Map();
const treeRoots = [page, ...Array.from({ length: 601 }, (_, index) => ({ ...page, id: `old-${index}`, title: `Old root ${index}`, database: false }))];
const comments = [];
const streams = new Set();
const links = new Map(['view', 'edit'].map((access) => [linkTokenHash(access), { id: access, itemId: 'page', access: access === 'edit' ? ShareAccess.EDIT : ShareAccess.VIEW, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }]));
const initial = new Y.Doc();
const paragraph = new Y.XmlElement('paragraph');
paragraph.setAttribute('id', 'browser-body');
paragraph.insert(0, [new Y.XmlText('Initial body')]);
const heading = new Y.XmlElement('heading');
heading.setAttribute('id', 'browser-heading');
heading.setAttribute('level', 2);
heading.insert(0, [new Y.XmlText('Outline heading')]);
const second = new Y.XmlElement('paragraph');
second.setAttribute('id', 'browser-second');
second.insert(0, [new Y.XmlText('Second block')]);
initial.getXmlFragment('default').push([heading, paragraph, second]);
let stored = Buffer.from(Y.encodeStateAsUpdate(initial));
const recoveredPages = new Map();
const importedFiles = new Map();
let failImportResponse = false;
const recoveryAttempts = [];
let failSplitResponse = false;
initial.destroy();
const frontend = path.resolve('../frontend/dist');
const peers = [];
let browser;
let browserConnection;
let profile;
let realtime;
let server;

function notify(topic, itemId) {
  for (const stream of streams) stream.write(`data: ${JSON.stringify({ topic, itemId, spaceId: 'space' })}\n\n`);
}

function rename(title, emit = true) {
  page.title = title;
  page.updatedAt = new Date(Date.parse(page.updatedAt) + 1).toISOString();
  if (emit) notify('page-details', 'page');
  realtime.titleChanged('page', title, new Date(page.updatedAt));
}

function json(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function database() {
  return { ...schema, rows: [{ ...page, id: 'row', title: 'Row', parentId: 'page', database: false, values: { text: rowValue } }] };
}

async function request(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/v1/')) {
    const file = path.resolve(frontend, '.' + (url.pathname === '/' || !path.extname(url.pathname) ? '/index.html' : url.pathname));
    if (!file.startsWith(frontend + path.sep)) return json(response, {}, 404);
    const content = await fs.readFile(file).catch(() => null);
    if (!content) return json(response, {}, 404);
    response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    response.end(content);
    return;
  }
  const route = url.pathname.replace(/^\/api\/v1/, '');
  if (route === '/spaces/space/files' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const id = crypto.randomUUID();
    importedFiles.set(id, { name: decodeURIComponent(request.headers['x-file-name']), bytes: Buffer.concat(chunks) });
    return json(response, { id }, 201);
  }
  if (/^\/notes\/[^/]+\/files\//.test(route)) {
    const file = importedFiles.get(route.split('/').at(-1));
    if (!file) return json(response, {}, 404);
    response.writeHead(200, { 'Content-Type': 'image/png' });
    return response.end(file.bytes);
  }
  if (route === '/spaces/space/page-drafts' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const draft = readPageDraft(Buffer.concat(chunks));
    const id = request.headers['x-recovery-id'];
    recoveryAttempts.push(id);
    if (!recoveredPages.has(id)) recoveredPages.set(id, { state: Buffer.from(Y.encodeStateAsUpdate(draft.document)), title: draft.title, kind: draft.board ? 'board' : 'note' });
    draft.document.destroy();
    if (failSplitResponse && draft.title.includes('(part 2/')) { failSplitResponse = false; return json(response, { message: 'Expected recovery response failure' }, 503); }
    if (failImportResponse && draft.title === 'Import child') { failImportResponse = false; return json(response, { message: 'Expected import response failure' }, 503); }
    return json(response, { id }, 201);
  }
  if (route.startsWith('/notes/') && recoveredPages.has(route.split('/')[2])) {
    const id = route.split('/')[2];
    if (request.method === 'PATCH') {
      let body = '';
      for await (const chunk of request) body += chunk;
      Object.assign(recoveredPages.get(id), JSON.parse(body));
    }
    if (route.endsWith('/comments')) return json(response, []);
    return json(response, { ...page, ...recoveredPages.get(id), state: undefined, id, database: false, editable: true });
  }
  if (route.startsWith('/items/') && recoveredPages.has(route.split('/')[2]) && route.endsWith('/links')) {
    const sourceItemId = route.split('/')[2];
    if (request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const { targetId, kind } = JSON.parse(body);
      const id = `${sourceItemId}/${kind.toUpperCase()}/${targetId}`;
      indexedLinks.set(id, { id, sourceItemId, targetItemId: targetId, kind: kind.toUpperCase() });
      return json(response, { id }, 201);
    }
    return json(response, { backlinks: [], outgoing: [...indexedLinks.values()].filter((link) => link.sourceItemId === sourceItemId).map((link) => ({ kind: link.kind.toLowerCase(), item: { id: link.targetItemId } })) });
  }
  let input;
  if (request.method === 'PATCH' || request.method === 'PUT') {
    let body = '';
    for await (const chunk of request) body += chunk;
    input = JSON.parse(body);
  }
  if (route === '/auth/refresh') {
    if ((request.headers.referer || '').includes('/share/')) return json(response, { message: 'Guest' }, 401);
    const chosen = new URL(request.headers.referer || 'http://localhost').searchParams.get('as');
    const identity = ['other', 'storage', 'stalled', 'corrupt', 'restored', 'compact', 'renewal'].includes(chosen) ? chosen : 'member';
    refreshRequests.set(identity, (refreshRequests.get(identity) || 0) + 1);
    if (identity === 'renewal' && failRenewals) {
      failRenewals -= 1;
      renewalFailures += 1;
      renewalFailedAt = Date.now();
      response.setHeader('Retry-After', '11');
      return json(response, { message: 'Expected temporary renewal failure' }, 429);
    }
    const accessToken = fixtureJwt.sign({ sub: identity, sid: 'session', jti: String(++tokenSequence) }, { expiresIn: identity === 'renewal' ? 2 : 15 * 60 });
    if (identity === 'renewal' && renewalFailedAt) renewalResumedAt = Date.now();
    issuedTokens.set(identity, accessToken);
    return json(response, { accessToken, user: { id: identity, email: `${identity}@example.com`, handle: identity, displayName: identity, role: 'member', timeZone: 'UTC', features: ['pages', 'boards'], timeFormat: '24h' } });
  }
  if (route === '/spaces') return json(response, [{ id: 'space', name: 'Test space', role: 'owner', personal: true }]);
  if (route === '/me/inbox/summary') return json(response, { unread: 0 });
  if (route === '/me/changes') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    response.write(': connected\n\n');
    streams.add(response);
    request.on('close', () => streams.delete(response));
    return;
  }
  if (route === '/health') return json(response, { status: 'ok' });
  if (route === '/me/notes' || route === '/spaces/space/notes') return json(response, [page, ...[...recoveredPages].map(([id, saved]) => ({ ...page, ...saved, state: undefined, id, database: false }))]);
  if (route === '/notes/page/people' && request.method === 'GET') return json(response, { permissions: page.permissions, people: [] });
  if (route === '/spaces/space/page-children') {
    const parentId = url.searchParams.get('parentId');
    navigationRequests.push(parentId);
    const pages = [...(parentId === 'old-600' ? [{ ...page, id: 'old-child', title: 'Old nested child', parentId }] : parentId ? [] : treeRoots), ...[...recoveredPages].filter(([, saved]) => (saved.parentId || null) === parentId).map(([id, saved]) => ({ ...page, ...saved, state: undefined, id, database: false }))];
    const start = url.searchParams.has('cursor') ? pages.findIndex((page) => page.id === url.searchParams.get('cursor')) + 1 : 0;
    const batch = pages.slice(start, start + 100);
    return json(response, { pages: batch, nextCursor: start + 100 < pages.length ? batch.at(-1).id : null, nextPage: pages[start + 100] || null });
  }
  if (route === '/notes/old-child' && request.method === 'GET') return json(response, { ...page, id: 'old-child', title: 'Old nested child', database: false, parentId: nestedParentId, path: nestedParentId && !treeParentHidden ? [{ id: 'old-600', title: 'Old root 600' }] : [] });
  if (route === '/notes/old-child' && request.method === 'PATCH') {
    nestedParentId = input.parentId;
    const moved = treeRoots.find((page) => page.id === 'old-child');
    moved.parentId = nestedParentId;
    treeMoves.push({ id: 'old-child', ...input });
    notify('page-details', 'old-child');
    return json(response, moved);
  }
  if (route === '/notes/old-child/comments') return json(response, []);
  if (route === '/items/old-child/links') return json(response, { backlinks: [], links: [] });
  if (/^\/notes\/old-\d+$/.test(route) && request.method === 'PATCH') {
    const id = route.split('/')[2];
    treeMoves.push({ id, ...input });
    const moved = treeRoots.splice(treeRoots.findIndex((page) => page.id === id), 1)[0];
    treeRoots.splice(treeRoots.findIndex((page) => page.id === input.relativeTo) + Number(input.placement === 'after'), 0, moved);
    notify('page-details');
    return json(response, moved);
  }
  if (route === '/items/page/links') return json(response, { backlinks: [], links: [] });
  if (route === `/notes/${embeddedBoardId}/board`) {
    if ((request.headers.referer || '').includes('/share/')) guestBoardRequests += 1;
    return json(response, { elements: [] });
  }
  if (route === '/notes/page/comments') return json(response, comments);
  if (route === '/notes/page' && request.method === 'GET') {
    detailsRequests += 1;
    const captured = { ...page, editable: !viewOnlyMember || fixtureJwt.decode(request.headers.authorization?.slice(7) || '')?.sub !== 'member' };
    if (nextDetailsDelay) { const wait = nextDetailsDelay; nextDetailsDelay = 0; await delay(wait); }
    return failDetails ? json(response, { message: 'Temporary fixture failure' }, 503) : json(response, captured);
  }
  if (route === '/notes/page' && request.method === 'PATCH') {
    if (input.expectedTitle !== page.title) return json(response, { message: 'Someone renamed this page. Your draft is kept.' }, 409);
    rename(input.title);
    return json(response, page);
  }
  if (route === '/notes/page/database' && request.method === 'GET') return json(response, database());
  if (route === '/notes/page/database' && request.method === 'PUT') {
    if (input.expectedRevision !== schema.revision) return json(response, { message: 'The database changed while you were editing.' }, 409);
    schema = { ...schema, ...input, revision: new Date(Date.parse(schema.revision) + 1).toISOString() };
    notify('page-databases', 'page');
    return json(response, database());
  }
  if (route === '/notes/row/properties' && request.method === 'PATCH') {
    if (input.expectedValues.text !== rowValue) return json(response, { message: 'Someone changed this property. Your draft is kept.' }, 409);
    rowValue = input.values.text;
    notify('page-databases', 'page');
    return json(response, { values: { text: rowValue } });
  }
  if (route.startsWith('/share/')) {
    const code = route.split('/')[2];
    const link = links.get(linkTokenHash(code));
    if (!link || link.revokedAt) return json(response, { message: 'Link closed' }, 404);
    return json(response, { access: code, item: { kind: 'note', title: page.title }, event: null, datePoll: false, content: { kind: 'note', id: 'page', state: null, database: true } });
  }
  return json(response, { message: `Unexpected fixture route ${route}` }, 404);
}

async function cdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onclose = () => {
    for (const waiter of pending.values()) waiter.reject(new Error('Browser connection closed'));
    pending.clear();
  };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  };
  return {
    socket,
    errors,
    send(method, params = {}) { return new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); },
    async evaluate(expression) {
      const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    },
    async until(expression, attempts = 100) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (await this.evaluate(`(async () => Boolean(await (${expression})))()`)) return;
        await delay(100);
      }
      throw new Error(`Browser condition failed: ${expression}\n${await this.evaluate('JSON.stringify({ url: location.href, blocks: [...document.querySelectorAll(".note-content [data-id]")].map((node) => ({ id: node.dataset.id, className: node.className })), outline: document.querySelector("[aria-label=\\"Page outline\\"]")?.innerHTML })')}\n${await this.evaluate('document.body.innerText')}`);
    },
    async type(label, value) {
      await this.evaluate(`(() => { const input = document.querySelector('input[aria-label="${label}"], textarea[aria-label="${label}"]:not([aria-hidden="true"])'); input.focus(); Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
    async click(label) {
      await this.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button'); button.click(); })()`);
    },
  };
}

try {
  server = http.createServer((req, res) => void request(req, res).catch((error) => { console.error(error.message); if (!res.headersSent) json(res, { message: error.message }, 500); else res.end(); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const prisma = {
    shareLink: { findFirst: async ({ where }) => { const link = links.get(where.tokenHash); return link && !link.revokedAt && link.itemId === where.itemId ? link : null; }, count: async ({ where }) => Number([...links.values()].some((link) => link.id === where.id && !link.revokedAt)) },
    noteDocument: { findUnique: async ({ where }) => ({ state: recoveredPages.get(where.itemId)?.state || stored }), upsert: async ({ where, update }) => ({ itemId: where.itemId, state: update.state }) },
    searchDocument: { updateMany: async () => ({}) },
    item: { findUnique: async ({ where }) => ({ title: recoveredPages.get(where.id)?.title || page.title, updatedAt: new Date(page.updatedAt) }), findFirst: async ({ where }) => ({ id: where.id }), findUniqueOrThrow: async () => ({ kind: ItemKind.NOTE }), update: async () => ({ spaceId: 'space' }) },
    refreshSession: { findUniqueOrThrow: async () => ({ signedInAt: new Date(), user: { displayName: 'Member' } }), count: async () => 1 },
    itemLink: {
      findMany: async ({ where }) => [...indexedLinks.values()].filter((link) => link.sourceItemId === where.sourceItemId && link.kind === where.kind),
      createMany: async ({ data }) => {
        let count = 0;
        for (const link of data) {
          const id = `${link.sourceItemId}/${link.kind}/${link.targetItemId}`;
          if (!indexedLinks.has(id)) { indexedLinks.set(id, { ...link, id }); count += 1; }
        }
        return { count };
      },
      deleteMany: async ({ where }) => ({ count: where.id.in.filter((id) => indexedLinks.delete(id)).length }),
    },
    noteVersion: { findFirst: async () => null, create: async () => ({}) },
    $transaction: async (operations) => {
      if (failSaves) throw new Error('Expected browser fixture save failure');
      const result = await Promise.all(operations);
      if (recoveredPages.has(result[0].itemId)) recoveredPages.get(result[0].itemId).state = result[0].state;
      else stored = result[0].state;
      return result;
    },
  };
  realtime = new RealtimeService({ httpAdapter: { getHttpServer: () => server } }, prisma, { spacesOf: () => ({}), itemsOf: () => ({}) }, fixtureJwt, { validate: async (payload) => ({ id: payload.sub }) }, { notify: () => undefined }, new ConfigService({ AUTH_TRUSTED_ORIGINS: origin, AUTH_ACCESS_TOKEN_SECRET: 'browser-fixture-secret' }), { assertPage: async (userId) => ({ role: viewOnlyMember && userId === 'member' ? SpaceRole.VIEWER : SpaceRole.OWNER, trashedAt: null, permissions: { organize: true } }), pagesOf: () => ({}) });
  realtime.onApplicationBootstrap();
  const upgrade = server.listeners('upgrade')[0];
  server.removeListener('upgrade', upgrade);
  server.on('upgrade', (request, socket, head) => {
    realtimeUpgrades += 1;
    if (offlineRealtime) socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    else upgrade(request, socket, head);
  });
  const executable = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
  if (!executable) throw new Error('Chrome or Edge is required');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-pages-browser-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let devtools;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    devtools = await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => null);
    if (devtools) break;
    await delay(100);
  }
  if (!devtools) throw new Error('Browser debugging endpoint did not start');
  const [port, endpoint] = devtools.trim().split(/\r?\n/);
  browserConnection = await cdp(`ws://127.0.0.1:${port}${endpoint}`);
  const downloads = path.join(profile, 'downloads');
  await fs.mkdir(downloads);
  await browserConnection.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  async function open(route, setup) {
    const { targetId } = await browserConnection.send('Target.createTarget', { url: 'about:blank' });
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((target) => target.id === targetId);
    const peer = await cdp(target.webSocketDebuggerUrl);
    peers.push(peer);
    await peer.send('Runtime.enable');
    await peer.send('Page.enable');
    if (setup) await peer.send('Page.addScriptToEvaluateOnNewDocument', { source: setup });
    await peer.send('Page.navigate', { url: origin + route });
    return peer;
  }
  async function deviceUpdates(peer, name) {
    return peer.evaluate(`new Promise((resolve, reject) => { const request = indexedDB.open(${JSON.stringify(name)}); request.onerror = () => reject(request.error); request.onsuccess = () => { const database = request.result; const transaction = database.transaction('updates', 'readonly'); const updates = transaction.objectStore('updates').getAll(); transaction.oncomplete = () => { database.close(); resolve(updates.result.map((update) => [...update])); }; transaction.onabort = () => reject(transaction.error); }; })`);
  }
  async function seedDevice(peer, name, updates) {
    await peer.evaluate(`new Promise((resolve, reject) => { const request = indexedDB.open(${JSON.stringify(name)}); request.onupgradeneeded = () => { request.result.createObjectStore('updates', { autoIncrement: true }); request.result.createObjectStore('custom'); }; request.onerror = () => reject(request.error); request.onsuccess = () => { const database = request.result; const transaction = database.transaction('updates', 'readwrite'); for (const update of ${JSON.stringify(updates)}) transaction.objectStore('updates').add(Uint8Array.from(update)); transaction.oncomplete = () => { database.close(); resolve(true); }; transaction.onabort = () => reject(transaction.error); }; })`);
  }
  async function append(peer, text) {
    await peer.send('Page.bringToFront');
    await peer.evaluate(`(() => { const content = document.querySelector('.note-content'); content.focus(); const range = document.createRange(); range.selectNodeContents(content); range.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(range); document.execCommand('insertText', false, ${JSON.stringify(text)}); })()`);
  }
  const member = await open('/notes/page');
  await member.until(`document.querySelector('textarea[aria-label="Page title"]')?.value === 'Original title' && document.querySelector('input[aria-label="Text"]')`);
  await member.until(`document.querySelector('button[aria-label="Collapse Test space"]')`);
  await member.evaluate(`document.querySelector('button[aria-label="Collapse Test space"]').click()`);
  await member.until(`document.querySelector('button[aria-label="Expand Test space"]')`);
  await member.evaluate(`document.querySelector('button[aria-label="Expand Test space"]').click()`);
  await member.until(`document.querySelector('[aria-label="Page tree"]')?.textContent.includes('Old root 0')`);
  assert.equal(navigationRequests.some(Boolean), false);
  for (let batch = 0; batch < 6; batch += 1) {
    await member.click('Load more pages');
    await member.until(`document.querySelector('[aria-label="Page tree"]')?.textContent.includes('Old root ${batch === 5 ? 600 : (batch + 2) * 100 - 2}')`);
  }
  assert.equal(await member.evaluate(`document.querySelector('[aria-label="Page tree"]').textContent.includes('Old nested child')`), false);
  await member.evaluate(`document.querySelector('button[aria-label="Expand Old root 600"]').click()`);
  await member.until(`document.querySelector('[aria-label="Page tree"]')?.textContent.includes('Old nested child')`);
  assert.ok(navigationRequests.includes('old-600'));
  await member.evaluate(`document.querySelector('button[aria-label="Actions for Old root 98"]').click()`);
  await member.until(`[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.trim() === 'Move down')`);
  await member.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Move down').click()`);
  await member.until(`(() => { const links = [...document.querySelectorAll('[aria-label="Page tree"] .page-tree-link[href]')].map((link) => link.getAttribute('href')); return links.indexOf('/notes/old-99') < links.indexOf('/notes/old-98'); })()`);
  assert.deepEqual(treeMoves.at(-1), { id: 'old-98', relativeTo: 'old-99', placement: 'after' });
  await member.evaluate(`document.querySelector('button[aria-label="Actions for Old root 98"]').click()`);
  await member.until(`[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.trim() === 'Move up')`);
  await member.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Move up').click()`);
  await member.until(`(() => { const links = [...document.querySelectorAll('[aria-label="Page tree"] .page-tree-link[href]')].map((link) => link.getAttribute('href')); return links.indexOf('/notes/old-98') < links.indexOf('/notes/old-99'); })()`);
  assert.deepEqual(treeMoves.at(-1), { id: 'old-98', relativeTo: 'old-99', placement: 'before' });
  await member.until(`indexedDB.databases().then((databases) => databases.some((database) => database.name === 'strata-note-member-page'))`);
  await member.until(`document.querySelector('[aria-label="Page outline"]')?.textContent.includes('Outline heading')`);
  await member.evaluate(`document.querySelector('[aria-label="Page outline"]').closest('details').open = true; document.querySelector('[aria-label="Page outline"] a').click()`);
  await member.until(`location.hash === '#block-browser-heading' && document.querySelector('[data-id="browser-heading"]').getAnimations().length > 0`);
  await member.evaluate(`location.hash = '#block-missing'`);
  await member.until(`document.body.textContent.includes('This linked block is no longer on this page.')`);
  await member.evaluate(`location.hash = ''; (() => { const content = document.querySelector('.note-content'); content.focus(); const range = document.createRange(); range.selectNodeContents(content.querySelector('[data-id="browser-body"]')); range.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(range); })()`);
  await member.click('Block');
  await member.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Move block down').click()`);
  await member.until(`document.querySelector('.note-content').textContent.indexOf('Second block') < document.querySelector('.note-content').textContent.indexOf('Initial body')`);
  await member.evaluate(`document.querySelector('button[aria-label="Undo"]').click()`);
  await member.until(`document.querySelector('.note-content').textContent.indexOf('Initial body') < document.querySelector('.note-content').textContent.indexOf('Second block')`);
  await member.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Clipboard denied')) } })`);
  await member.click('Block');
  await member.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Copy link to block').click()`);
  await member.until(`document.querySelector('[role="dialog"]')?.textContent.includes('/notes/page#block-')`);
  await member.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await member.type('Page title', 'Local title draft');
  rename('Remote title');
  await member.until(`document.body.innerText.includes('Someone changed this value')`);
  assert.equal(await member.evaluate(`document.querySelector('textarea[aria-label="Page title"]').value`), 'Local title draft');
  await member.click('Save my change');
  await member.until(`document.querySelector('textarea[aria-label="Page title"]').value === 'Local title draft' && !document.body.innerText.includes('Someone changed this value')`);
  assert.equal(page.title, 'Local title draft');
  await member.type('Page title', 'Unsent title');
  failDetails = true;
  notify('page-details', 'page');
  await member.until(`[...document.querySelectorAll('button')].some((button) => ['Try again', 'Retry'].includes(button.textContent.trim()))`);
  assert.equal(await member.evaluate(`document.querySelector('textarea[aria-label="Page title"]').value`), 'Unsent title');
  failDetails = false;
  notify('page-details', 'page');
  await delay(500);
  rename('Conflicting title', false);
  await member.evaluate(`document.querySelector('textarea[aria-label="Page title"]').blur()`);
  await member.until(`document.body.innerText.includes('Someone changed this value')`);
  assert.equal(page.title, 'Conflicting title');
  await member.click('Use current value');
  await member.until(`document.querySelector('textarea[aria-label="Page title"]').value === 'Conflicting title'`);
  await member.type('Text', 'Local property draft');
  rowValue = 'Remote property';
  notify('page-databases', 'page');
  await member.until(`document.body.innerText.includes('Someone changed this value')`);
  assert.equal(await member.evaluate(`document.querySelector('input[aria-label="Text"]').value`), 'Local property draft');
  await member.click('Use current value');
  await member.until(`document.querySelector('input[aria-label="Text"]').value === 'Remote property'`);
  comments.push({ id: 'comment', parentId: null, blockId: null, body: 'Remote comment', resolvedAt: null, editedAt: null, createdAt: new Date().toISOString(), author: { id: 'other', displayName: 'Other member' } });
  notify('page-comments', 'page');
  await member.until(`document.body.innerText.includes('Remote comment')`);
  const before = detailsRequests;
  nextDetailsDelay = 800;
  rename('First update');
  for (let attempt = 0; attempt < 100 && detailsRequests === before; attempt += 1) await delay(25);
  rename('Second update');
  await member.until(`document.querySelector('textarea[aria-label="Page title"]').value === 'Second update'`);
  assert.ok(detailsRequests >= before + 2);
  const viewer = await open('/share/view#block-browser-heading');
  await viewer.until(`document.querySelector('.note-content')?.textContent.includes('Initial body')`);
  await viewer.until(`document.body.textContent.includes('Its database rows and properties are not shared.')`);
  await viewer.until(`document.querySelector('[data-id="browser-heading"]')?.getAnimations().length > 0`);
  const editor = await open('/share/edit');
  await editor.until(`document.querySelector('.note-content[contenteditable="true"]')`);
  const privateEmbed = new Y.XmlElement('boardEmbed');
  privateEmbed.setAttribute('boardId', embeddedBoardId);
  realtime.hocuspocus.documents.get('page').getXmlFragment('default').push([privateEmbed]);
  await viewer.until(`document.querySelector('.note-content')?.textContent.includes('This board needs its own share link.')`);
  await editor.until(`document.querySelector('.note-content')?.textContent.includes('This board needs its own share link.')`);
  await member.until(`document.querySelector('.note-board')?.textContent.includes('Nothing drawn yet')`);
  assert.equal(guestBoardRequests, 0);
  failSaves = true;
  await editor.evaluate(`(() => { const content = document.querySelector('.note-content'); content.focus(); const range = document.createRange(); range.selectNodeContents(content); range.collapse(false); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText', false, ' Browser guest edit'); })()`);
  await viewer.until(`document.querySelector('.note-content')?.textContent.includes('Browser guest edit')`);
  assert.equal(await viewer.evaluate(`document.querySelector('.note-content').getAttribute('contenteditable')`), 'false');
  await editor.until(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Retry save')`);
  await editor.click('Download text');
  let downloaded;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    downloaded = (await fs.readdir(downloads)).find((file) => file.endsWith('.txt'));
    if (downloaded) break;
    await delay(50);
  }
  assert.ok(downloaded);
  assert.ok((await fs.readFile(path.join(downloads, downloaded), 'utf8')).includes('Browser guest edit'));
  await editor.click('Download draft');
  let downloadedDraft;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    downloadedDraft = (await fs.readdir(downloads)).find((file) => file.endsWith('.strata-page'));
    if (downloadedDraft) break;
    await delay(50);
  }
  assert.ok(downloadedDraft);
  const draft = readPageDraft(await fs.readFile(path.join(downloads, downloadedDraft)));
  assert.ok(draft.document.getXmlFragment('default').toString().includes('Browser guest edit'));
  assert.equal(draft.document.getXmlFragment('default').get(0).getAttribute('id'), 'browser-heading');
  draft.document.destroy();
  failSaves = false;
  await editor.click('Retry save');
  await editor.until(`document.body.innerText.includes('Saved')`);
  rename('Live shared title');
  await viewer.until(`document.querySelector('h1')?.textContent === 'Live shared title'`);
  await editor.until(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === '3 people here')`);
  await editor.click('3 people here');
  await editor.until(`document.querySelector('[role="dialog"]')?.textContent.includes('Can view')`);
  await editor.until(`document.querySelector('[role="dialog"]')?.textContent.includes('Editing')`);
  realtime.hocuspocus.documents.get('page').getXmlFragment('default').push(Array.from({ length: 40 }, (_, index) => {
    const block = new Y.XmlElement('paragraph');
    block.setAttribute('id', `follow-block-${index}`);
    block.insert(0, [new Y.XmlText(`Following paragraph ${index}. `.repeat(20))]);
    if (index === 30) {
      const quote = new Y.XmlElement('blockquote');
      quote.setAttribute('id', 'follow-container-30');
      quote.insert(0, [block]);
      return quote;
    }
    return block;
  }));
  await member.until(`document.querySelector('[data-id="follow-block-39"]')`);
  await member.send('Page.bringToFront');
  await member.evaluate(`document.querySelector('[data-id="follow-block-30"]').scrollIntoView({ block: 'start', behavior: 'instant' })`);
  const memberPosition = () => [...realtime.hocuspocus.documents.get('page').awareness.getStates().values()].find((state) => state.user?.id === 'member/member')?.viewport?.blockId;
  for (let attempt = 0; attempt < 100 && memberPosition() !== 'follow-block-30'; attempt += 1) await delay(25);
  assert.equal(memberPosition(), 'follow-block-30', await member.evaluate(`JSON.stringify({ headerHeight: getComputedStyle(document.documentElement).getPropertyValue('--header-height'), previous: document.querySelector('[data-id="follow-block-29"]').getBoundingClientRect().toJSON(), target: document.querySelector('[data-id="follow-block-30"]').getBoundingClientRect().toJSON() })`));
  const jumpedBlock = memberPosition();
  await editor.send('Page.bringToFront');
  await editor.until(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Jump to Member')`);
  await editor.until(`document.querySelector('[role="dialog"] [data-block-id="${jumpedBlock}"]')`);
  await editor.click('Jump to Member');
  await editor.until(`document.querySelector('[data-id="${jumpedBlock}"]').getAnimations().length > 0`);
  await editor.click('3 people here');
  await editor.click('Follow Member');
  await editor.until(`document.body.textContent.includes('Following Member')`);
  await member.send('Page.bringToFront');
  await member.evaluate(`document.querySelector('[data-id="follow-block-12"]').scrollIntoView({ block: 'start', behavior: 'instant' })`);
  for (let attempt = 0; attempt < 100 && memberPosition() !== 'follow-block-12'; attempt += 1) await delay(25);
  assert.equal(memberPosition(), 'follow-block-12');
  const followedBlock = memberPosition();
  await editor.until(`document.querySelector('[data-id="${followedBlock}"]').getAnimations().length > 0`);
  await editor.send('Page.bringToFront');
  await editor.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 400, deltaX: 0, deltaY: 100 });
  await editor.until(`!document.body.textContent.includes('Following Member')`);
  await editor.click('3 people here');
  await editor.click('Follow Member');
  await editor.until(`document.body.textContent.includes('Following Member')`);
  await editor.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await editor.until(`!document.body.textContent.includes('Following Member')`);
  await editor.click('3 people here');
  await editor.click('Follow Member');
  await editor.until(`document.body.textContent.includes('Following Member')`);
  const followingContent = realtime.hocuspocus.documents.get('page').getXmlFragment('default');
  const removedPosition = followingContent.toArray().findIndex((block) => block.getAttribute('id') === followedBlock);
  assert.ok(removedPosition >= 0);
  followingContent.delete(removedPosition, 1);
  await editor.until(`!document.body.textContent.includes('Following Member')`);
  await viewer.send('Page.bringToFront');
  await viewer.click('3 people here');
  await viewer.until(`[...document.querySelectorAll('[role="dialog"] li')].some((row) => row.textContent.includes('Guest') && row.textContent.includes('Can edit') && row.textContent.includes('Follow Guest'))`);
  await viewer.evaluate(`(() => { const row = [...document.querySelectorAll('[role="dialog"] li')].find((row) => row.textContent.includes('Guest') && row.textContent.includes('Can edit')); [...row.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Follow Guest').click(); })()`);
  await viewer.until(`document.body.textContent.includes('Following Guest')`);
  assert.equal(await viewer.evaluate(`document.querySelector('.note-content').getAttribute('contenteditable')`), 'false');
  links.get(linkTokenHash('edit')).revokedAt = new Date();
  realtime.closeShareLink('edit');
  await editor.until(`document.body.innerText.includes('This link has expired or was turned off')`);
  assert.equal(await editor.evaluate(`Boolean(document.querySelector('.note-content'))`), false);
  await viewer.until(`!document.body.textContent.includes('Following Guest')`);
  const privateDraft = new Y.Doc();
  const privateParagraph = new Y.XmlElement('paragraph');
  privateParagraph.insert(0, [new Y.XmlText('Private device-only draft')]);
  privateDraft.getXmlFragment('default').push([privateParagraph]);
  const privateUpdate = Buffer.from(Y.encodeStateAsUpdate(privateDraft)).toString('base64');
  privateDraft.destroy();
  await member.evaluate(`new Promise((resolve, reject) => { const request = indexedDB.open('strata-note-member-page'); request.onerror = () => reject(request.error); request.onsuccess = () => { const database = request.result; const transaction = database.transaction('updates', 'readwrite'); transaction.objectStore('updates').add(Uint8Array.from(atob('${privateUpdate}'), (character) => character.charCodeAt(0))); transaction.oncomplete = () => { database.close(); resolve(true); }; transaction.onabort = () => reject(transaction.error); }; })`);
  viewOnlyMember = true;
  const readonly = await open('/notes/page');
  await readonly.until(`document.querySelector('.note-content[contenteditable="false"]')?.textContent.includes('Browser guest edit')`);
  assert.equal(await readonly.evaluate(`document.querySelector('.note-content').textContent.includes('Private device-only draft')`), false);
  const otherAccount = await open('/notes/page?as=other');
  await otherAccount.until(`document.querySelector('.note-content[contenteditable="true"]')?.textContent.includes('Browser guest edit')`);
  await otherAccount.until(`indexedDB.databases().then((databases) => databases.some((database) => database.name === 'strata-note-other-page'))`);
  assert.equal(await otherAccount.evaluate(`document.querySelector('.note-content').textContent.includes('Private device-only draft')`), false);
  assert.equal(realtime.hocuspocus.documents.get('page').getXmlFragment('default').toString().includes('Private device-only draft'), false);
  const recovery = await open('/pages?as=other');
  await recovery.until(`document.querySelector('button[aria-label="Import"]')`);
  await recovery.evaluate(`document.querySelector('button[aria-label="Import"]').click()`);
  await recovery.until(`document.querySelector('input[accept=".strata-page"]')`);
  const { root } = await recovery.send('DOM.getDocument');
  const { nodeId } = await recovery.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[accept=".strata-page"]' });
  await recovery.send('DOM.setFileInputFiles', { nodeId, files: [path.join(downloads, downloadedDraft)] });
  await recovery.until(`/^\\/notes\\/[0-9a-f-]{36}$/.test(location.pathname) && document.querySelector('.note-content')?.textContent.includes('Browser guest edit')`);
  assert.equal(await recovery.evaluate('location.pathname'), `/notes/${recoveryAttempts.at(-1)}`);
  assert.equal(await recovery.evaluate(`document.querySelector('.note-content [data-id="browser-heading"]').textContent`), 'Outline heading');
  const storage = await open('/notes/page?as=storage', `(() => { const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function(name, ...args) { if (name === 'strata-note-storage-page') throw new DOMException('Storage denied', 'SecurityError'); return open.call(this, name, ...args); }; window.restoreDeviceStorage = () => { IDBFactory.prototype.open = open; }; })()`);
  await storage.until(`document.body.textContent.includes('Device drafts unavailable') && document.querySelector('.note-content[contenteditable="true"]')`);
  assert.equal(await storage.evaluate(`document.body.textContent.includes('Previous device-only edits may not be loaded')`), true);
  await storage.evaluate(`window.restoreDeviceStorage()`);
  await storage.click('Retry device storage');
  await storage.until(`!document.body.textContent.includes('Device drafts unavailable') && !document.body.textContent.includes('Loading device draft')`);
  assert.ok((await deviceUpdates(storage, 'strata-note-storage-page')).length > 0);
  await storage.evaluate(`(() => { const add = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(...args) { if (this.transaction.db.name === 'strata-note-storage-page') throw new DOMException('Quota exceeded', 'QuotaExceededError'); return add.apply(this, args); }; window.restoreDeviceStorage = () => { IDBObjectStore.prototype.add = add; }; })()`);
  await append(storage, ' Quota recovery draft');
  await storage.until(`document.body.textContent.includes('Device drafts unavailable')`);
  assert.equal(await storage.evaluate(`document.body.textContent.includes('Keep this tab open or download a draft')`), true);
  assert.equal(await storage.evaluate(`document.querySelector('.note-content').textContent.includes('Quota recovery draft')`), true);
  await storage.evaluate(`window.restoreDeviceStorage()`);
  await storage.click('Retry device storage');
  await storage.until(`!document.body.textContent.includes('Device drafts unavailable') && !document.body.textContent.includes('Loading device draft')`);
  const written = new Y.Doc();
  for (const update of await deviceUpdates(storage, 'strata-note-storage-page')) Y.applyUpdate(written, Uint8Array.from(update));
  assert.ok(written.getXmlFragment('default').toString().includes('Quota recovery draft'));
  written.destroy();
  await storage.evaluate(`(() => { const add = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(...args) { const request = add.apply(this, args); if (this.transaction.db.name === 'strata-note-storage-page') request.addEventListener('success', () => this.transaction.abort(), { once: true }); return request; }; window.restoreDeviceStorage = () => { IDBObjectStore.prototype.add = add; }; })()`);
  await append(storage, ' Aborted device write');
  await storage.until(`document.body.textContent.includes('Device drafts unavailable')`);
  await storage.evaluate(`window.restoreDeviceStorage()`);
  await storage.click('Retry device storage');
  await storage.until(`!document.body.textContent.includes('Device drafts unavailable') && !document.body.textContent.includes('Loading device draft')`);
  const afterAbort = new Y.Doc();
  for (const update of await deviceUpdates(storage, 'strata-note-storage-page')) Y.applyUpdate(afterAbort, Uint8Array.from(update));
  assert.ok(afterAbort.getXmlFragment('default').toString().includes('Aborted device write'));
  afterAbort.destroy();
  const stalled = await open('/notes/page?as=stalled', `(() => { const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function(name, ...args) { if (name === 'strata-note-stalled-page') { window.stalledDraftRequest = {}; return window.stalledDraftRequest; } return open.call(this, name, ...args); }; window.restoreDeviceStorage = () => { IDBFactory.prototype.open = open; }; })()`);
  await stalled.until(`document.body.textContent.includes('Loading device draft')`);
  await stalled.until(`document.body.textContent.includes('Device drafts unavailable') && document.querySelector('.note-content[contenteditable="true"]')`);
  await stalled.evaluate(`window.restoreDeviceStorage()`);
  await stalled.click('Retry device storage');
  await stalled.until(`!document.body.textContent.includes('Device drafts unavailable') && !document.body.textContent.includes('Loading device draft')`);
  await stalled.evaluate(`window.stalledDraftRequest.onerror(); window.stalledDraftRequest.result = { close: () => { window.staleDraftClosed = true; } }; window.stalledDraftRequest.onsuccess()`);
  assert.equal(await stalled.evaluate(`window.staleDraftClosed && !document.body.textContent.includes('Device drafts unavailable')`), true);
  await seedDevice(storage, 'strata-note-corrupt-page', [[1, 2, 3]]);
  const corrupt = await open('/notes/page?as=corrupt');
  await corrupt.until(`document.body.textContent.includes('Device drafts unavailable') && document.querySelector('.note-content[contenteditable="true"]')`);
  assert.deepEqual(await deviceUpdates(corrupt, 'strata-note-corrupt-page'), [[1, 2, 3]]);
  const cached = new Y.Doc();
  const cachedParagraph = new Y.XmlElement('paragraph');
  cachedParagraph.setAttribute('id', 'restored-device-block');
  cachedParagraph.insert(0, [new Y.XmlText('Device draft restored')]);
  cached.getXmlFragment('default').push([cachedParagraph]);
  const cachedUpdate = [...Y.encodeStateAsUpdate(cached)];
  cached.destroy();
  await seedDevice(storage, 'strata-note-restored-page', [cachedUpdate]);
  const restored = await open('/notes/page?as=restored');
  await restored.until(`document.querySelector('.note-content[contenteditable="true"]')?.textContent.includes('Device draft restored')`);
  await restored.send('Page.reload', { ignoreCache: true });
  await restored.until(`document.querySelector('.note-content[contenteditable="true"]')?.textContent.includes('Device draft restored')`);
  assert.equal(await restored.evaluate(`document.querySelectorAll('.note-content [data-id="restored-device-block"]').length`), 1);
  await seedDevice(storage, 'strata-note-compact-page', Array.from({ length: 501 }, () => cachedUpdate));
  const compact = await open('/notes/page?as=compact');
  await compact.until(`document.querySelector('.note-content[contenteditable="true"]')?.textContent.includes('Device draft restored') && !document.body.textContent.includes('Loading device draft')`);
  assert.ok((await deviceUpdates(compact, 'strata-note-compact-page')).length < 10);
  const secondCompact = await open('/notes/page?as=compact');
  await secondCompact.until(`document.querySelector('.note-content[contenteditable="true"]')?.textContent.includes('Device draft restored')`);
  const beforeReset = realtimeUpgrades;
  realtime.hocuspocus.documents.get('page').getConnections().find((connection) => connection.context.userId === 'compact').close({ code: 1000, reason: 'Server reset document' });
  for (let attempt = 0; attempt < 100 && !(realtimeUpgrades > beforeReset && realtime.hocuspocus.documents.get('page').getConnections().filter((connection) => connection.context.userId === 'compact').length === 2); attempt += 1) await delay(50);
  assert.ok(realtimeUpgrades > beforeReset);
  assert.equal(realtime.hocuspocus.documents.get('page').getConnections().filter((connection) => connection.context.userId === 'compact').length, 2);
  offlineRealtime = true;
  for (const peer of [compact, secondCompact]) {
    await peer.send('Network.enable');
    await peer.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  }
  for (const connection of realtime.hocuspocus.documents.get('page').getConnections()) if (connection.context.userId === 'compact') connection.webSocket.terminate();
  for (const peer of [compact, secondCompact]) await peer.until(`document.body.textContent.includes('Offline.')`);
  await compact.evaluate(`(() => { const add = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(...args) { const request = add.apply(this, args); if (this.transaction.db.name === 'strata-note-compact-page' && !window.holdingDraftCommit) { window.holdingDraftCommit = true; const keepAlive = () => { if (!window.releaseDraftCommit) this.get(0).onsuccess = keepAlive; }; keepAlive(); } return request; }; })()`);
  await append(compact, ' Offline first tab');
  await compact.until(`document.body.textContent.includes('Saving device draft')`);
  assert.equal(await compact.evaluate(`document.body.textContent.includes('Offline. Draft saved on this device')`), false);
  await append(compact, ' Pending during navigation');
  await append(secondCompact, ' Offline second tab');
  await compact.send('Page.bringToFront');
  await compact.evaluate(`document.querySelector('a[href="/pages"]').click()`);
  await compact.until(`location.pathname === '/pages' && !document.querySelector('.note-content')`);
  await compact.evaluate(`window.releaseDraftCommit = true`);
  await secondCompact.until(`document.body.textContent.includes('Offline. Draft saved on this device')`);
  const reopened = await open('/notes/page?as=compact');
  await reopened.until(`document.querySelector('.note-content')?.textContent.includes('Offline first tab') && document.querySelector('.note-content')?.textContent.includes('Offline second tab') && document.querySelector('.note-content')?.textContent.includes('Pending during navigation')`);
  assert.equal(realtime.hocuspocus.documents.get('page').getXmlFragment('default').toString().includes('Offline first tab'), false);
  assert.equal(realtime.hocuspocus.documents.get('page').getXmlFragment('default').toString().includes('Offline second tab'), false);
  assert.equal(realtime.hocuspocus.documents.get('page').getXmlFragment('default').toString().includes('Pending during navigation'), false);
  offlineRealtime = false;
  for (const peer of [compact, secondCompact]) await peer.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await reopened.until(`document.body.textContent.includes('Saved')`);
  const large = new Y.Doc();
  const largeParagraph = new Y.XmlElement('paragraph');
  largeParagraph.setAttribute('id', 'large-recovery-block');
  largeParagraph.insert(0, [new Y.XmlText('Oversized recovery '.repeat(330_000))]);
  large.getXmlFragment('default').push([largeParagraph]);
  const largeText = largeParagraph.toArray()[0].toString();
  const largeFile = path.join(downloads, 'oversized.strata-page');
  await fs.writeFile(largeFile, JSON.stringify({ type: 'strata-page', version: 1, format: 4, kind: 'note', title: 'Oversized page', state: Buffer.from(Y.encodeStateAsUpdate(large)).toString('base64') }), 'utf8');
  large.destroy();
  const recoverLarge = await open('/pages?as=other');
  await recoverLarge.until(`document.querySelector('button[aria-label="Import"]')`);
  await recoverLarge.evaluate(`document.querySelector('button[aria-label="Import"]').click()`);
  await recoverLarge.until(`document.querySelector('input[accept=".strata-page"]')`);
  const largeRoot = await recoverLarge.send('DOM.getDocument');
  const largeInput = await recoverLarge.send('DOM.querySelector', { nodeId: largeRoot.root.nodeId, selector: 'input[accept=".strata-page"]' });
  await recoverLarge.send('DOM.setFileInputFiles', { nodeId: largeInput.nodeId, files: [largeFile] });
  await recoverLarge.until(`document.querySelector('[role="dialog"]')?.textContent.includes('2 smaller pages')`);
  const recoveryCount = recoveredPages.size;
  failSplitResponse = true;
  await recoverLarge.click('Recover 2 pages');
  await recoverLarge.until(`document.body.textContent.includes('1 of 2 recovered') && [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Resume recovery')`);
  assert.equal(recoveredPages.size, recoveryCount + 2);
  await recoverLarge.click('Resume recovery');
  await recoverLarge.until(`location.pathname.startsWith('/notes/') && document.querySelector('.note-content[contenteditable="true"]')?.textContent.includes('Oversized recovery')`);
  assert.equal(recoveredPages.size, recoveryCount + 2);
  const splitIds = recoveryAttempts.slice(-3);
  assert.notEqual(splitIds[0], splitIds[1]);
  assert.equal(splitIds[1], splitIds[2]);
  let restoredLarge = '';
  for (const id of [splitIds[0], splitIds[1]]) {
    assert.ok(recoveredPages.get(id).state.byteLength <= 5 * 1024 * 1024);
    const part = new Y.Doc();
    Y.applyUpdate(part, recoveredPages.get(id).state);
    restoredLarge += part.getXmlFragment('default').get(0).toArray().map((node) => node.toString()).join('');
    part.destroy();
  }
  assert.equal(restoredLarge, largeText);
  await append(recoverLarge, ' Edited recovered part');
  await recoverLarge.until(`document.body.textContent.includes('Saved')`);
  const importBrowser = await open('/pages?as=other');
  await importBrowser.until(`document.querySelector('button[aria-label="Import"]')`);
  await importBrowser.evaluate(`document.querySelector('button[aria-label="Import"]').click()`);
  await importBrowser.until(`document.querySelector('input[webkitdirectory]')`);
  const pagesBeforeImport = recoveredPages.size;
  const uploadsBeforeImport = importedFiles.size;
  const attemptsBeforeImport = recoveryAttempts.length;
  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHioAAAAASUVORK5CYII=', 'base64');
  await importBrowser.evaluate(`(() => {
    const data = new DataTransfer();
    const add = (path, body, type = 'text/markdown') => { const file = new File([body], path.split('/').pop(), { type }); Object.defineProperty(file, 'webkitRelativePath', { value: path }); data.items.add(file); };
    add('Export/Root.md', '# Import root\\n[Child](Root/Child.md)\\n\\n![Photo](photo.png)\\n\\n![Missing photo](missing.png)'.replaceAll('\\\\n', '\\n'));
    add('Export/Root/Child.md', '# Import child\\n[Root](../Root.md)'.replaceAll('\\\\n', '\\n'));
    add('Export/Huge.md', 'x'.repeat(8 * 1024 * 1024 + 1));
    add('Export/Huge/Skipped.md', '# Skipped child');
    add('Export/photo.png', new Uint8Array(${JSON.stringify([...photo])}), 'image/png');
    add('Export/unused.png', new Uint8Array(${JSON.stringify([...photo])}), 'image/png');
    const input = document.querySelector('input[webkitdirectory]'); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await importBrowser.until(`document.body.textContent.includes('2 pages ready; 2 skipped') && document.body.textContent.includes('Missing image: missing.png')`);
  assert.equal(recoveredPages.size, pagesBeforeImport);
  assert.equal(importedFiles.size, uploadsBeforeImport);
  failImportResponse = true;
  await importBrowser.click('Import 2 pages');
  await importBrowser.until(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Resume import' && !button.disabled)`);
  await importBrowser.click('Resume import');
  await importBrowser.until(`document.body.textContent.includes('2 of 2 completed')`);
  assert.equal(recoveredPages.size, pagesBeforeImport + 2);
  assert.equal(importedFiles.size, uploadsBeforeImport + 1);
  assert.deepEqual([...importedFiles.values()].at(-1).bytes, photo);
  const importAttempts = recoveryAttempts.slice(attemptsBeforeImport);
  assert.equal(importAttempts.length, 3);
  assert.equal(importAttempts[1], importAttempts[2]);
  assert.equal(recoveredPages.get(importAttempts[1]).parentId, importAttempts[0]);
  for (const [source, target] of [[importAttempts[0], importAttempts[1]], [importAttempts[1], importAttempts[0]]]) {
    assert.ok([...indexedLinks.values()].some((link) => link.sourceItemId === source && link.kind === 'MENTION' && link.targetItemId === target));
    const document = new Y.Doc();
    Y.applyUpdate(document, recoveredPages.get(source).state);
    assert.ok(document.getXmlFragment('default').toString().includes(`href="/notes/${target}"`));
    document.destroy();
  }
  await importBrowser.click('Done');
  const navigationBeforeReveal = navigationRequests.length;
  const nestedPage = await open('/notes/old-child?as=other', `localStorage.setItem('strata-page-tree-open', '[]')`);
  await nestedPage.until(`document.querySelector('[aria-label="Page tree"] a[href="/notes/old-child"][aria-current="page"]') && document.querySelector('button[aria-label="Collapse Old root 600"]')`);
  assert.deepEqual(navigationRequests.slice(navigationBeforeReveal).filter(Boolean), ['old-600']);
  treeParentHidden = true;
  treeRoots.splice(treeRoots.findIndex((page) => page.id === 'old-600'), 1);
  treeRoots.push({ ...page, id: 'old-child', title: 'Old nested child', database: false, parentId: nestedParentId });
  notify('page-details', 'old-child');
  await nestedPage.until(`document.querySelector('[aria-label="Page tree"] a[href="/notes/old-child"][aria-current="page"]') && !document.querySelector('[aria-label="Page tree"] a[href="/notes/old-600"]')`);
  await nestedPage.send('Page.bringToFront');
  await nestedPage.evaluate(`document.querySelector('button[aria-label="Actions for Old nested child"]').click()`);
  await nestedPage.until(`[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.trim() === 'Move to space root')`);
  await nestedPage.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Move to space root').click()`);
  await nestedPage.until(`!document.querySelector('[role="menu"]')`);
  assert.deepEqual(treeMoves.at(-1), { id: 'old-child', parentId: null });
  const renewal = await open('/notes/page?as=renewal');
  await renewal.until(`document.querySelector('.note-content[contenteditable="true"]') && document.body.textContent.includes('Saved')`);
  const refreshesBeforeOffline = refreshRequests.get('renewal');
  const upgradesBeforeRenewal = realtimeUpgrades;
  offlineRealtime = true;
  await renewal.send('Network.enable');
  await renewal.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  realtime.hocuspocus.documents.get('page').getConnections().find((connection) => connection.context.userId === 'renewal').webSocket.terminate();
  await renewal.until(`document.body.textContent.includes('Offline.')`);
  await append(renewal, ' Offline edit after token expiry');
  await renewal.until(`document.body.textContent.includes('Offline. Draft saved on this device')`);
  await delay(2_200);
  assert.throws(() => fixtureJwt.verify(issuedTokens.get('renewal')), /jwt expired/);
  failRenewals = 1;
  offlineRealtime = false;
  await renewal.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await renewal.until(`document.body.textContent.includes('Saved') && !document.body.textContent.includes('Offline.')`, 200);
  assert.equal(renewalFailures, 1);
  assert.ok(renewalResumedAt - renewalFailedAt >= 11_000);
  assert.ok(refreshRequests.get('renewal') >= refreshesBeforeOffline + 2);
  assert.ok(realtimeUpgrades >= upgradesBeforeRenewal + 2);
  assert.equal(realtime.hocuspocus.documents.get('page').getConnections().filter((connection) => connection.context.userId === 'renewal').length, 1);
  assert.ok(realtime.hocuspocus.documents.get('page').getXmlFragment('default').toString().includes('Offline edit after token expiry'));
  assert.ok([...indexedLinks.values()].some((link) => link.sourceItemId === 'page' && link.kind === 'MENTION' && link.targetItemId === embeddedBoardId));
  assert.equal(guestBoardRequests, 0);
  for (const peer of peers) assert.deepEqual(peer.errors, [], await peer.evaluate('location.href'));
  console.log('PASS: paginated moves/ancestor reveal, pages/sharing/following, device failures/offline drafts, expired JWT renewal/retry, split recovery, import preview/internal links/original media and duplicate-free resume');
} finally {
  for (const peer of peers) peer.socket.close();
  if (browserConnection) {
    await browserConnection.send('Browser.close').catch(() => undefined);
    browserConnection.socket.close();
  }
  if (browser && browser.exitCode === null) {
    for (let attempt = 0; attempt < 30 && browser.exitCode === null; attempt += 1) await delay(100);
    if (browser.exitCode === null) browser.kill();
  }
  for (const stream of streams) stream.end();
  if (realtime) await realtime.onModuleDestroy();
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (profile) {
    const absolute = path.resolve(profile);
    if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('strata-pages-browser-')) throw new Error('Unexpected browser profile cleanup path');
    await fs.rm(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
})().catch((error) => { console.error(error); process.exitCode = 1; });
'@ | node --input-type=commonjs
if ($LASTEXITCODE -ne 0) { throw 'Pages browser verification failed' }
} finally {
  Pop-Location
}
