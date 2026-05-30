const CACHE_RESET_VERSION = 'docboard-cache-reset-20260531';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith('docboard'))
        .map((cacheName) => caches.delete(cacheName))
    );

    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(
      clients
        .filter((client) => new URL(client.url).pathname.startsWith('/docboard'))
        .map((client) => client.navigate(client.url))
    );
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/docboard/')) return;

  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});

self.CACHE_RESET_VERSION = CACHE_RESET_VERSION;
