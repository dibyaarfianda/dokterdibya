const CACHE_VERSION = '20260602hide4';
const CACHE_PREFIX = 'sisiwanita-patient-portal-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/patient-login.html',
  '/patient-menu.html',
  '/album-usg.html',
  '/dokumen-medis.html',
  '/hasil-lab.html',
  '/booking-klinik.html',
  '/antrian.html',
  '/sisiwanita.webmanifest',
  OFFLINE_URL,
  '/images/pwa-icons/swlogo-pwa-192x192.png',
  '/images/pwa-icons/swlogo-pwa-512x512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function() { return self.skipWaiting(); })
      .catch(function() {})
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(cacheNames.map(function(cacheName) {
          if (cacheName.indexOf(CACHE_PREFIX) === 0 && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          if (cacheName.indexOf('sisiwanita-landing-') === 0 || cacheName.indexOf('dokterdibya-patient-cache-') === 0) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var request = event.request;
  var requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/staff/') || requestUrl.pathname.startsWith('/socket.io/')) return;

  var freshRequest = new Request(request, { cache: 'no-store' });
  var isNavigation = request.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(freshRequest)
        .then(function(response) {
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(request, responseClone).catch(function() {}); });
          }
          return response;
        })
        .catch(function() {
          return caches.match(request).then(function(cached) {
            return cached || caches.match('/patient-menu.html') || caches.match('/index.html') || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function(cachedResponse) {
      if (cachedResponse) return cachedResponse;
      return fetch(request)
        .then(function(response) {
          if (!response || response.status !== 200 || response.type !== 'basic') return response;
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(request, responseClone).catch(function() {}); });
          return response;
        })
        .catch(function() {
          if (request.destination === 'document') return caches.match(OFFLINE_URL);
          return new Response('', { status: 504, statusText: 'Gateway Timeout' });
        });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});