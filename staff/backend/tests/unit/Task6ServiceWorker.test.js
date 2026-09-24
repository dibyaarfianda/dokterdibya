const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../../..');

function loadWorker(file, { failPrecache = false } = {}) {
    const handlers = {};
    const removed = [];
    const cacheNames = ['other-app-v1', 'static-old', 'dynamic-old', 'dokterdibya-staff-old', 'sisiwanita-patient-portal-old'];
    const cache = { addAll: jest.fn(async () => { if (failPrecache) throw new Error('precache failed'); }), put: jest.fn() };
    const caches = {
        open: jest.fn(async () => cache),
        keys: jest.fn(async () => cacheNames),
        delete: jest.fn(async name => { removed.push(name); return true; }),
        match: jest.fn(async () => null)
    };
    const self = {
        addEventListener: (type, handler) => { handlers[type] = handler; },
        skipWaiting: jest.fn(async () => {}),
        clients: { claim: jest.fn(async () => {}) },
        location: { origin: 'https://example.test' },
        registration: { showNotification: jest.fn() }
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
        self, caches, Request: class { constructor(url) { this.url = url; } },
        Response: class {}, URL, fetch: jest.fn(), clients: self.clients,
        console: { log() {}, error() {} }
    }, { filename: file });
    return { handlers, removed, caches, self };
}

test.each(['staff/public/sw.js', 'public/sw.js'])('%s does not activate a partially precached version', async file => {
    const worker = loadWorker(file, { failPrecache: true });
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await expect(install).rejects.toThrow('precache failed');
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
});

test.each(['staff/public/sw.js', 'public/sw.js'])('%s retains unrelated app caches during activation', async file => {
    const worker = loadWorker(file);
    let activate;
    worker.handlers.activate({ waitUntil: promise => { activate = promise; } });
    await activate;
    expect(worker.removed).not.toContain('other-app-v1');
    if (file.startsWith('staff/')) expect(worker.removed).not.toContain('sisiwanita-patient-portal-old');
    else expect(worker.removed).not.toContain('dokterdibya-staff-old');
});

test('patient worker SKIP_WAITING message checks data with logical conjunction', async () => {
    const worker = loadWorker('public/sw.js');
    worker.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
});

test('patient precache contains only versioned same-origin static assets, never HTML or CDN', async () => {
    const worker = loadWorker('public/sw.js');
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await install;
    const urls = worker.caches.open.mock.results.length ? worker.caches.open.mock.results[0].value : null;
    expect(urls).toBeTruthy();
    const items = (await urls).addAll.mock.calls[0][0];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
        expect(item).toMatch(/^\/[^?]+\?v=20260924wave3$/);
        expect(item).not.toMatch(/\.html(?:\?|$)/);
    }
});

test('both workers treat fragment HTML and API as no-store rather than immutable assets', () => {
    const patient = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
    const staff = fs.readFileSync(path.join(root, 'staff/public/sw.js'), 'utf8');
    expect(patient).toMatch(/if \(request\.mode === 'navigate' \|\| url\.pathname\.endsWith\('\.html'\)/);
    expect(patient).toContain("new Request(request, { cache: 'no-store' })");
    expect(patient).toContain("url.pathname.startsWith('/api/')");
    expect(staff).toContain("new Request(request, { cache: 'no-store' })");
    expect(staff).toContain("url.pathname.startsWith('/api/')");
});
