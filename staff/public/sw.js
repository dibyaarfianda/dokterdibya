/**
 * Service Worker for Dokter Dibya Staff PWA
 * Provides offline support and caching
 * Updated: Real-time friendly for service hours
 */

const CACHE_NAME = 'dokterdibya-staff-v2';
const STATIC_CACHE = 'static-v2';
const DYNAMIC_CACHE = 'dynamic-v2';

// Static assets to cache on install (only UI assets, not data)
const STATIC_ASSETS = [
  '/staff/public/index-adminlte.html',
  '/staff/public/styles/mobile-responsive.css',
  '/staff/public/styles/chat-slide-panel.css',
  '/staff/public/sounds/send.mp3',
  '/staff/public/sounds/incoming.mp3',
  // External CDN assets
  'https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/js/adminlte.min.js',
  'https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css',
  'https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js',
  'https://cdn.datatables.net/1.13.6/js/dataTables.bootstrap4.min.js',
  'https://cdn.datatables.net/1.13.6/css/dataTables.bootstrap4.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11'
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

// API routes that can use network-first with cache fallback (non-critical)
const CACHEABLE_API_ROUTES = [
  '/api/patients',
  '/api/announcements',
  '/api/settings',
  '/api/users'
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
        })).catch(err => {
          console.log('[SW] Some assets failed to cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
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

  // IMPORTANT: Bypass SW for real-time API routes (always fresh data)
  const isRealtimeRoute = REALTIME_ROUTES.some(route => url.pathname.startsWith(route));
  if (isRealtimeRoute) {
    // Don't intercept - let browser handle directly for fresh data
    return;
  }

  // Cacheable API routes - network first with cache fallback
  const isCacheableAPI = CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route));
  if (isCacheableAPI) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Other API requests - network only (no caching)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Static assets - cache first, then network
  event.respondWith(cacheFirst(request));
});

// Cache-first strategy
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
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
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Return error response for API calls
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
    console.log('[SW] Clearing all caches...');
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
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
        version: CACHE_NAME
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
