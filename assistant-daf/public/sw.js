const CACHE = 'assistant-daf-shell-20260930-2';
const SHELL = ['/assistant-daf/', '/assistant-daf/index.html', '/assistant-daf/style.css', '/assistant-daf/app.js', '/assistant-daf/docboard-session.js', '/assistant-daf/webauthn.umd.min.js', '/assistant-daf/manifest.json', '/assistant-daf/icon.svg'];
let pendingShare = null;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter((key) => key.startsWith('assistant-daf-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    // Remove storage used by the pre-release prototype; shared messages now stay in memory only.
    indexedDB.deleteDatabase('assistant-daf-temporary-share');
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === 'POST' && url.pathname === '/assistant-daf/share') {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const text = String(form.get('text') || form.get('title') || '').slice(0, 10000);
      if (!text.trim()) return Response.redirect('/assistant-daf/?share_error=empty', 303);
      const token = crypto.randomUUID();
      pendingShare = { text, token, expires: Date.now() + 300000 };
      setTimeout(() => { if (pendingShare?.token === token) pendingShare = null; }, 300000);
      return Response.redirect(`/assistant-daf/?shared=${token}`, 303);
    })());
    return;
  }
  if (event.request.method !== 'GET' || !SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
self.addEventListener('message', (event) => {
  if (!event.source?.url) return;
  const source = new URL(event.source.url);
  if (source.origin !== self.location.origin || !source.pathname.startsWith('/assistant-daf/')) return;
  if (event.data?.type === 'CLEAR_SHARE') { pendingShare = null; return; }
  if (event.data?.type !== 'TAKE_SHARE') return;
  const matches = pendingShare && event.data.token === pendingShare.token;
  const text = matches && Date.now() < pendingShare.expires ? pendingShare.text : '';
  if (matches) pendingShare = null;
  event.source.postMessage({ type: 'SHARED_TEXT', text, expired: !text });
});
self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (payload?.type !== 'assistant_daf_reminder') return;
  event.waitUntil(self.registration.showNotification('Pengingat jadwal tindakan', {
    body: 'Buka Asisten DAF untuk memeriksa jadwal besok.',
    icon: '/assistant-daf/icon.svg', tag: String(payload.tag || 'assistant-daf-reminder').slice(0, 80)
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/assistant-daf/'));
});
