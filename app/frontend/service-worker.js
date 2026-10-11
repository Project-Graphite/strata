const cacheName = 'strata-__VERSION__';
const offlinePage = '/offline.html';
const shareCache = 'strata-share';
const precache = [...__ASSETS__, offlinePage, '/offline.css', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(precache)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== cacheName && name !== shareCache).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'activate') self.skipWaiting();
});

async function receiveShare(request) {
  const form = await request.formData();
  await caches.delete(shareCache);
  const cache = await caches.open(shareCache);
  const field = (name) => (typeof form.get(name) === 'string' ? form.get(name) : '');
  await cache.put(
    '/share-target/text',
    new Response(JSON.stringify({ title: field('title'), text: field('text'), url: field('url') }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const files = form.getAll('files').filter((file) => typeof file !== 'string').slice(0, 10);
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        `/share-target/files/${index}`,
        new Response(file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        }),
      ),
    ),
  );
  return Response.redirect(new URL('/save', self.location.origin).href, 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(offlinePage)));
  } else if (precache.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});

self.addEventListener('push', (event) => {
  const message = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(message.title || 'Strata', {
      icon: '/icons/icon-192.png',
      data: { link: message.link || '/inbox' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.link || '/inbox', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(target.href);
      return open.focus().then(() => open.navigate(target.href));
    }),
  );
});
