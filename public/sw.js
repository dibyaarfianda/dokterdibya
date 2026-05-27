/**
 * Service Worker for Dokter Dibya Patient Portal PWA
 * Provides offline support and caching
 */

// CRITICAL: Increment this on every deploy to force cache refresh
// Use timestamp format to force all old caches to be abandoned
const CACHE_VERSION = '20260528j'; // 2026-05-28j - fix kick counter trial shell and local mock flow
const CACHE_NAME = `dokterdibya-patient-cache-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Files to cache immediately on install
const PRECACHE_FILES = [
  '/',
  '/patient-menu.html',
  '/trial-landing/index.html',
  '/patient-menu-simple-trial.html',
  '/kick-counter-trial.html',
  '/my-corner-visit-trial.html',
  '/styles/patient-trial-theme.css',
  '/styles/patient-my-corner.css',
  '/scripts/patient-my-corner.js',
  '/scripts/patient-my-corner-visit.js',
  '/patient-login.html',
  '/offline.html',
  '/images/dibya-logo.png',
  '/images/pwa-icons/swlogo-pwa-192x192.png',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential files');
        return cache.addAll(PRECACHE_FILES);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Cache failed:', error);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const freshRequest = new Request(request, { cache: 'no-store' });

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API calls - always fetch from network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Skip staff panel - not managed by patient SW
  if (url.pathname.startsWith('/staff/')) {
    return;
  }

  // For navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(freshRequest)
        .then((response) => {
          // Clone and cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline - try cache, then offline page
          return caches.match(request)
            .then((cachedResponse) => {
              return cachedResponse || caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }

  // For JS/CSS files - network first (always get fresh code on deploy)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(freshRequest)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // For other assets (images, fonts) - cache first, network fallback
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          });
      })
  );
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Notifikasi baru dari Dokter Dibya',
    icon: '/images/pwa-icons/swlogo-pwa-192x192.png',
    badge: '/images/pwa-icons/swlogo-pwa-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/patient-menu.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Dokter Dibya', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/patient-menu.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes('dokterdibya') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Allow clients to trigger immediate activation of an updated SW.
self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
