const CACHE_NAME = 'docboard-v1';
const STATIC_ASSETS = [
  '/docboard/',
  '/docboard/offline.html'
];

// Install - cache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // API: network-first with short cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, 300)); // 5 min cache
    return;
  }

  // Hashed assets (JS/CSS from Vite): cache-first
  if (url.pathname.match(/\/assets\/.*\.[a-f0-9]+\./)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Fonts: cache-first, 30 days
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation: network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/docboard/offline.html'))
    );
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request));
});

// Push notification handler
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'DocBoard';
  const options = {
    body: data.body || '',
    icon: '/docboard/icons/icon-192.png',
    badge: '/docboard/icons/icon-192.png',
    data: data.url || '/docboard/',
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/docboard/')
  );
});

// Strategies
async function networkFirst(request, maxAge = 0) {
  try {
    const response = await fetch(request);
    if (response.ok && maxAge > 0) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
