/**
 * Service Worker for Dokter Dibya Staff PWA
 * Provides offline support and caching
 * Updated: Real-time friendly for service hours
 */

const STAFF_PWA_VERSION = 'v413';
const CACHE_NAME = `dokterdibya-staff-${STAFF_PWA_VERSION}`;
const STATIC_CACHE = `${CACHE_NAME}-static`;
const DYNAMIC_CACHE = `${CACHE_NAME}-dynamic`;
const versionedStaffAsset = (path) => `${path}?v=${STAFF_PWA_VERSION}`;

// Static assets to cache on install (only UI assets, not data)
const STATIC_ASSETS = [
  versionedStaffAsset('/staff/public/styles/mobile-responsive.css'),
  versionedStaffAsset('/staff/public/styles/staff-shell.css'),
  versionedStaffAsset('/staff/public/sounds/send.mp3'),
  versionedStaffAsset('/staff/public/sounds/incoming.mp3'),
];

// Real-time API routes - NEVER cache these (always fresh)
const REALTIME_ROUTES = [
  '/api/sunday-appointments',
  '/api/sunday-clinic',
  '/api/queue',
  '/api/billing',
  '/api/medical-records',
  '/api/booking',
  '/socket.io'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => {
          return new Request(url, { mode: 'cors' });
        }));
      })
      .then(() => self.skipWaiting())
      .catch(async error => {
        await caches.delete(STATIC_CACHE);
        throw error;
      })
  );
});

// Activate event - clean up OLD caches only, keep current
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  const CURRENT_CACHES = [CACHE_NAME, STATIC_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[SW] Found caches:', cacheNames);
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('dokterdibya-staff-') && !CURRENT_CACHES.includes(cacheName))
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log('[SW] Old caches cleaned, claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, DELETE should always go to network)
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // IMPORTANT: Completely bypass SW for Socket.IO (real-time connections)
  if (url.pathname.includes('/socket.io')) {
    return;
  }

  // JavaScript files use stable version strings (?v=vXX) for cache busting
  // Let browser HTTP cache handle them directly (not SW cache)
  if (url.pathname.endsWith('.js') && url.pathname.includes('/scripts/')) {
    return;
  }

  // IMPORTANT: Bypass SW for real-time API routes (always fresh data)
  const isRealtimeRoute = REALTIME_ROUTES.some(route => url.pathname.startsWith(route));
  if (isRealtimeRoute) {
    // Don't intercept - let browser handle directly for fresh data
    return;
  }

  // Staff HTML fragments/pages loaded via fetch() must stay fresh (avoid stale blank content)
  const isStaffHtml = url.pathname.startsWith('/staff/public/') && url.pathname.endsWith('.html');
  if (isStaffHtml) {
    event.respondWith(networkFirst(new Request(request, { cache: 'no-store' })));
    return;
  }

  // Authenticated API responses are network-only and never enter Cache Storage.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML navigation requests - network first (always get fresh HTML)
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(new Request(request, { cache: 'no-store' })));
    return;
  }

  // Static assets - cache first, then network
  event.respondWith(cacheFirst(request));
});

// Cache-first strategy
async function cacheFirst(request) {
  const cachedResponse = await (await caches.open(STATIC_CACHE)).match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.log('[SW] Fetch failed:', error);
    // Return offline page if available
    return caches.match('/staff/public/offline.html');
  }
}

// Network-first strategy
async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.log('[SW] Network unavailable');
    return new Response(JSON.stringify({
      success: false,
      message: 'Anda sedang offline'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Listen for messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing staff caches...');
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name.startsWith('dokterdibya-staff-')).map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      console.log('[SW] All caches cleared');
      // Notify client that cache is cleared
      event.ports[0]?.postMessage({ success: true, message: 'Cache cleared' });
    });
  }

  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    console.log('[SW] Clearing API cache...');
    caches.delete(DYNAMIC_CACHE).then(() => {
      console.log('[SW] API cache cleared');
      event.ports[0]?.postMessage({ success: true, message: 'API cache cleared' });
    });
  }

  // Get cache status
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    caches.keys().then((cacheNames) => {
      event.ports[0]?.postMessage({
        caches: cacheNames,
        version: STAFF_PWA_VERSION,
        cacheName: CACHE_NAME
      });
    });
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-appointments') {
    event.waitUntil(syncAppointments());
  }
});

async function syncAppointments() {
  // Implement sync logic when back online
  console.log('[SW] Syncing appointments...');
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = { title: 'Notifikasi', body: 'Ada update baru' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message,
    icon: '/staff/public/icons/icon-192x192.png',
    badge: '/staff/public/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/staff/public/index-adminlte.html'
    },
    actions: [
      { action: 'open', title: 'Buka' },
      { action: 'close', title: 'Tutup' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes('/staff/') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
  );
});
