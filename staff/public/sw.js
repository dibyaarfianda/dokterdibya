/**
 * Service Worker for Dokter Dibya Staff PWA
 * Provides offline support and caching
 * Updated: Real-time friendly for service hours
 */

const STAFF_PWA_VERSION = 'v415';
const CACHE_NAME = `dokterdibya-staff-${STAFF_PWA_VERSION}`;
const STATIC_CACHE = `${CACHE_NAME}-static`;
const DYNAMIC_CACHE = `${CACHE_NAME}-dynamic`;
const versionedStaffAsset = (path) => `${path}?v=${STAFF_PWA_VERSION}`;

// The initial Staff module graph is immutable for this cache version. Keep the
// complete shell graph in the install transaction so the first controlled warm
// navigation does not revalidate dozens of JavaScript files over the network.
const STAFF_SHELL_SCRIPTS = [
  '/staff/public/scripts/auth.js',
  '/staff/public/scripts/chat-popup.js',
  '/staff/public/scripts/dashboard.js',
  '/staff/public/scripts/date-utils.js',
  '/staff/public/scripts/error-handler.js',
  '/staff/public/scripts/global-chat-loader.js',
  '/staff/public/scripts/live-queue-dashboard-utils.js',
  '/staff/public/scripts/main.js',
  '/staff/public/scripts/mobile-helper.js',
  '/staff/public/scripts/pages/dashboard-new-patients.js',
  '/staff/public/scripts/patient-demo-manager.js',
  '/staff/public/scripts/patient-list-pages.js',
  '/staff/public/scripts/realtime-sync.js',
  '/staff/public/scripts/role-constants.js',
  '/staff/public/scripts/rum.js',
  '/staff/public/scripts/safe-render.js',
  '/staff/public/scripts/session-manager.js',
  '/staff/public/scripts/socket-credentials.js',
  '/staff/public/scripts/shell/actions.js',
  '/staff/public/scripts/shell/bootstrap.js',
  '/staff/public/scripts/shell/compact-sidebar.js',
  '/staff/public/scripts/shell/credentials.js',
  '/staff/public/scripts/shell/feature-loader.js',
  '/staff/public/scripts/shell/module-helpers.js',
  '/staff/public/scripts/shell/notification-badges.js',
  '/staff/public/scripts/shell/page-descriptors.js',
  '/staff/public/scripts/shell/page-registry.js',
  '/staff/public/scripts/shell/polling-coordinator.js',
  '/staff/public/scripts/shell/registration-codes.js',
  '/staff/public/scripts/shell/support-chat-badge.js',
  '/staff/public/scripts/staff-api.js',
  '/staff/public/scripts/tap-feedback.js',
  '/staff/public/scripts/toast.js',
  '/staff/public/scripts/vps-auth-v2.js'
];
const staffShellScriptPaths = new Set(STAFF_SHELL_SCRIPTS);
const verifiedClientVersions = new Map();

function rememberClientVersion(clientId, version) {
  if (!clientId) return;
  // A mismatched explicit shell version poisons this client for the remainder
  // of this worker's control, even if an old document races a later request.
  if (verifiedClientVersions.get(clientId) === null) return;
  if (!verifiedClientVersions.has(clientId) && verifiedClientVersions.size >= 256) {
    verifiedClientVersions.delete(verifiedClientVersions.keys().next().value);
  }
  verifiedClientVersions.set(clientId, version === STAFF_PWA_VERSION ? version : null);
}

function isLegacyStaffDependency(request, clientId, url) {
  if (!clientId || url.origin !== self.location.origin || url.search || url.hash ||
      !['/scripts/socket-credentials.js', '/scripts/patient-list-pages.js'].includes(url.pathname)) return false;
  try {
    const referrer = new URL(request.referrer);
    return referrer.origin === self.location.origin && !referrer.username && !referrer.password &&
      /^\/staff\/public\/scripts\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/.test(referrer.pathname) &&
      referrer.search === '?v=v413' && !referrer.hash &&
      referrer.href === `${referrer.origin}${referrer.pathname}?v=v413`;
  } catch (_) {
    return false;
  }
}

// Static assets to cache on install (only UI assets, not data)
const STATIC_ASSETS = [
  versionedStaffAsset('/staff/public/styles/mobile-responsive.css'),
  versionedStaffAsset('/staff/public/styles/staff-shell.css'),
  versionedStaffAsset('/staff/public/sounds/send.mp3'),
  versionedStaffAsset('/staff/public/sounds/incoming.mp3'),
  ...STAFF_SHELL_SCRIPTS.map(versionedStaffAsset)
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

  // A v413 Staff module can still import the two former patient-root scripts
  // after this worker claims its open page. Keep the old request off the
  // mutable patient root and bind it to reviewed Staff bytes.
  if (isLegacyStaffDependency(request, event.clientId, url)) {
    if (url.pathname === '/scripts/socket-credentials.js') {
      event.respondWith(caches.open(STATIC_CACHE)
        .then(cache => cache.match(versionedStaffAsset('/staff/public/scripts/socket-credentials.js')))
        .then(cached => cached || fetch(`${self.location.origin}${versionedStaffAsset('/staff/public/scripts/socket-credentials.js')}`)));
    } else {
      event.respondWith(fetch(`${self.location.origin}/staff/public/scripts/patient-list-pages.js?v=v413`));
    }
    return;
  }

  // Serve only this worker's exact immutable shell graph. Old explicit versions
  // bypass this cache rather than receiving a new-version module under an old URL.
  if (url.origin === self.location.origin && staffShellScriptPaths.has(url.pathname)) {
    const requestedVersion = url.searchParams.get('v');
    if (requestedVersion) rememberClientVersion(event.clientId, requestedVersion);
    if (requestedVersion && requestedVersion !== STAFF_PWA_VERSION) return;
    if (!requestedVersion && verifiedClientVersions.get(event.clientId) !== STAFF_PWA_VERSION) return;
    event.respondWith(cacheStaffShellScript(request, url.pathname));
    return;
  }

  // Other scripts remain network-backed; no cross-version ignoreSearch lookup.
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

async function cacheStaffShellScript(request, path) {
  const cached = await (await caches.open(STATIC_CACHE)).match(versionedStaffAsset(path));
  return cached || fetch(request);
}

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
