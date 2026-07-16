const CACHE_NAME = 'docboard-pwa-20260716-1';
const APP_SHELL = [
  '/docboard/',
  '/docboard/index.html',
  '/docboard/manifest.json',
  '/docboard/offline.html',
  '/docboard/icons/docboardlogo.svg',
  '/docboard/icons/favicon.svg',
  '/docboard/icons/docboard-apple-touch-icon-120.png',
  '/docboard/icons/docboard-apple-touch-icon-152.png',
  '/docboard/icons/docboard-apple-touch-icon-167.png',
  '/docboard/icons/docboard-apple-touch-icon-180.png',
  '/docboard/icons/apple-touch-icon.png',
  '/docboard/icons/docboard-icon-192.png',
  '/docboard/icons/docboard-icon-512.png',
  '/docboard/icons/docboard-maskable-192.png',
  '/docboard/icons/docboard-maskable-512.png',
  '/docboard/icons/icon-192.png',
  '/docboard/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith('docboard') && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/docboard/')) return;

  if (url.pathname.startsWith('/docboard/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/docboard/index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('/docboard/index.html')) || caches.match('/docboard/offline.html');
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return caches.match('/docboard/offline.html');
    }
  })());
});

self.CACHE_NAME = CACHE_NAME;
