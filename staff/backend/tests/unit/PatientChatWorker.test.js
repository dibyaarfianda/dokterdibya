const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../../..');
function worker() {
    const listeners = {}, saved = [];
    const cache = { addAll: async list => saved.push(...list), match: jest.fn(async () => new Response('cached chat')), put: jest.fn() };
    const showNotification = jest.fn(async () => {}), fetch = jest.fn(async () => new Response('network'));
    const self = { location: { origin: 'https://sisiwanita.id' }, addEventListener: (event, fn) => { listeners[event] = fn; },
        registration: { showNotification }, skipWaiting: async () => {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8'), {
        self, URL, Request, Response, console, fetch, caches: { open: async () => cache, delete: async () => true }
    });
    return { listeners, saved, cache, showNotification, fetch };
}
test('chat shell and dependencies open from the current release cache without a network roundtrip', async () => {
    const w = worker(); let result;
    w.listeners.install({ waitUntil: p => { result = p; } }); await result;
    expect(w.saved.some(url => url.startsWith('/community-chat.html?v='))).toBe(true);
    for (const url of ['/community-chat.html?embed=patient', '/scripts/patient-chat-preview.js?v=current']) {
        w.listeners.fetch({ request: new Request('https://sisiwanita.id' + url), respondWith: p => { result = p; } });
        expect(await (await result).text()).toBe('cached chat');
    }
    expect(w.fetch).not.toHaveBeenCalled();
    let intercepted = false;
    w.listeners.fetch({ request: new Request('https://sisiwanita.id/api/community-chat/rooms'), respondWith: () => { intercepted = true; } });
    expect(intercepted).toBe(false);
});
test('chat push carries preview, SW branding, audible default and a message-specific tag', async () => {
    const w = worker(); let result;
    w.listeners.push({ data: { json: () => ({ title: 'Chat Komunitas', body: 'Mama: Selamat pagi', url: '/community-chat.html?room=lobby&message=12', data: { type: 'community_chat', tag: 'community-chat-12' } }) }, waitUntil: p => { result = p; } });
    await result;
    const [title, options] = w.showNotification.mock.calls[0];
    expect(title).toBe('Chat Komunitas');
    expect(options).toMatchObject({ body: 'Mama: Selamat pagi', silent: false, tag: 'community-chat-12', renotify: true });
    for (const key of ['icon', 'badge']) {
        expect(options[key]).toContain('/images/pwa-icons/sw');
        expect(fs.existsSync(path.join(root, 'public', options[key]))).toBe(true);
    }
    expect(options.data.url).toContain('message=12');
});
