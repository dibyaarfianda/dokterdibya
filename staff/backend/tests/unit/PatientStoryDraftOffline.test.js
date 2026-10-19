const fs = require('fs');
const path = require('path');
const vm = require('vm');
function worker() {
    const listeners = {}, installed = [];
    const cached = new Response('<title>Ruang Cerita offline</title>');
    const cache = { addAll: async urls => installed.push(...urls), put: jest.fn(), match: async key => key === '/ruang-cerita.html' ? cached.clone() : null };
    const context = { self: { location: { origin: 'https://sisiwanita.id' }, addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting: async () => {} },
        URL, Request, Response, console, caches: { open: async () => cache, delete: async () => true }, fetch: async () => { throw new Error('offline'); } };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../../public/sw.js'), 'utf8'), context);
    return { listeners, installed };
}
test('worker updates precache the safe editor shell as well as both autosave scripts', async () => {
    const w = worker(); let installed;
    w.listeners.install({ waitUntil: p => { installed = p; } }); await installed;
    expect(w.installed).toContain('/ruang-cerita.html');
    expect(w.installed.some(u => u.startsWith('/scripts/patient-story-drafts.js?v='))).toBe(true);
    expect(w.installed.some(u => u.startsWith('/scripts/patient-story-editor.js?v='))).toBe(true);
});
test('offline navigation returns the cached story editor without caching private APIs', async () => {
    const w = worker(); let result;
    w.listeners.fetch({ request: new Request('https://sisiwanita.id/ruang-cerita.html'), respondWith: p => { result = p; } });
    expect(await (await result).text()).toContain('Ruang Cerita offline');
    let intercepted = false;
    w.listeners.fetch({ request: new Request('https://sisiwanita.id/api/patient-stories/draft'), respondWith: () => { intercepted = true; } });
    expect(intercepted).toBe(false);
});
