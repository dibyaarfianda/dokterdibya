/**
 * Service Worker for SISIwanita Patient Portal PWA
 * Provides offline support and caching
 */

// CRITICAL: Increment this on every deploy to force cache refresh
// Use timestamp format to force all old caches to be abandoned
const CACHE_VERSION = '20260926patientpopup1';
const CACHE_NAME = `sisiwanita-patient-portal-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Files to cache immediately on install
const PRECACHE_FILES = [
  '/',
  '/patient-menu.html',
  '/app-closed.html',
  '/patient-menu.html',
  '/info-terbaru.html',
  '/patient-tool-template.html',
  '/kick-counter.html',
  '/pregnancy-tracker.html',
  '/contraction-timer.html',
  '/fertility-calendar.html',
  '/jadwal-vitamin.html',
  '/album-usg.html',
  '/dokumen-medis.html',
  '/hasil-lab.html',
  '/riwayat-kunjungan.html',
  '/antrian.html',
  '/booking-klinik.html',
  '/jadwal-rs.html',
  '/perjalanan-ibu.html',
  '/tanya-dokter.html',
  '/artikel.html',
  '/community-chat.html',
  '/my-corner-visit.html',
  '/styles/patient-portal-theme.css',
  '/styles/patient-tool-shell.css',
  '/styles/patient-tool-retrofit.css',
  '/styles/patient-my-corner.css',
  '/scripts/patient-menu-shell.js',
  '/scripts/community-chat-badge.js',
  '/scripts/community-chat-ui.js',
  '/scripts/patient-native-app-guard.js',
  '/scripts/booking-break-display.js',
  '/scripts/patient-session.js',
  '/scripts/socket-credentials.js',
  '/scripts/patient-shell/session-bootstrap.js',
  '/scripts/patient-shell/portal-nickname.js',
  '/scripts/patient-shell/guest-session.js',
  '/scripts/patient-shell/router.js',
  '/scripts/patient-shell/routes.js',
  '/scripts/patient-shell/navigation.js',
  '/scripts/patient-shell/layout.js',
  '/scripts/patient-shell/sheet-controller.js',
  '/scripts/patient-shell/pwa-install-controller.js',
  '/scripts/patient-shell/exit-controller.js',
  '/scripts/patient-shell/feature-loader.js',
  '/scripts/patient-shell/features/my-corner-controller.js',
    '/scripts/patient-shell/features/bug-report-controller.js',
    '/scripts/patient-shell/features/notification-controller.js',
  '/scripts/patient-tool-shell.js',
  '/scripts/patient-tool-retrofit.js',
  '/scripts/patient-my-corner.js',
  '/scripts/patient-my-corner-visit.js',
  '/scripts/landing/bootstrap.js',
  '/scripts/landing/feature-loader.js',
  '/scripts/landing/promo-preview.js',
  '/scripts/landing/install-prompt.js',
    '/scripts/landing/navigation-interactions.js',
    '/scripts/landing/announcement-guard.js',
    '/scripts/landing/footer-effects.js',
  '/js/patient-tracker.js',
  '/patient-login.html',
  '/patient-intake.html',
  '/offline.html',
  '/images/dibya-logo.png',
  '/images/ruang-saya/pastel.jpg',
  '/images/ruang-saya/icons-transparent/album.png',
  '/images/ruang-saya/icons-transparent/dokumen.png',
  '/images/ruang-saya/icons-transparent/favorit.png',
  '/images/ruang-saya/icons-transparent/jadwal.png',
  '/images/ruang-saya/icons-transparent/resume.png',
  '/images/ruang-saya/icons-transparent/tanyadokter.png',
  '/images/ruang-saya/icons-transparent/tracker.png',
  '/images/ruang-saya/icons-transparent/vitamin.png',
  '/images/pwa-icons/sw2v8-any-192x192.png',
  '/images/pwa-icons/sw2v8-any-180.png',
  '/images/pwa-icons/sw2v8-any-512x512.png',
  '/images/pwa-icons/sw2v8-mask-192x192.png',
  '/images/pwa-icons/sw2v8-mask-512x512.png',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'
];
const IMMUTABLE_STATIC_ASSETS = [...new Set(PRECACHE_FILES)].filter(url => {
  const parsed = new URL(url, self.location.origin);
  return parsed.origin === self.location.origin && !parsed.pathname.endsWith('.html') && parsed.pathname !== '/';
}).map(url => `${url}?v=${CACHE_VERSION}`);
const OWNED_STATIC_PATHS = new Set(IMMUTABLE_STATIC_ASSETS.map(url => new URL(url, self.location.origin).pathname));
function matchOwnedStatic(cache, request, url) {
  if (url.origin !== self.location.origin || !OWNED_STATIC_PATHS.has(url.pathname)) return Promise.resolve(null);
  // Cache entries are revision-pinned, while page asset URLs retain their own
  // historical version query. Ignore only the query for this explicit app set.
  return cache.match(request, { ignoreSearch: true });
}

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential files');
        return cache.addAll(IMMUTABLE_STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch(async (error) => {
        await caches.delete(CACHE_NAME);
        throw error;
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
            if (cacheName.startsWith('sisiwanita-patient-portal-') && cacheName !== CACHE_NAME) {
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
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(freshRequest)
        .catch(() => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
    );
    return;
  }

  // For JS/CSS files - network first (always get fresh code on deploy)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(freshRequest)
        .catch(() => {
          return caches.open(CACHE_NAME).then(cache => matchOwnedStatic(cache, request, url));
        })
    );
    return;
  }

  // For other assets (images, fonts) - cache first, network fallback
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => matchOwnedStatic(cache, request, url))
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request);
      })
  );
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Notifikasi baru dari SISIwanita',
    icon: '/images/pwa-icons/sw2v8-any-192x192.png',
    badge: '/images/pwa-icons/sw2v8-any-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/patient-menu.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SISIwanita', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target;
  try { target = new URL(event.notification.data?.url || '/patient-menu.html', self.location.origin); }
  catch (_) { target = new URL('/patient-menu.html', self.location.origin); }
  if (target.origin !== self.location.origin) target = new URL('/patient-menu.html', self.location.origin);
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if ('navigate' in client) await client.navigate(target.href);
      await client.focus();
      return;
    }
    return clients.openWindow(target.href);
  })());
});

// Allow clients to trigger immediate activation of an updated SW.
self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
