const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../../..');

function loadWorker(file, { failPrecache = false, offline = false } = {}) {
    const handlers = {};
    const removed = [];
    const cacheNames = ['other-app-v1', 'static-old', 'dynamic-old', 'dokterdibya-staff-old', 'sisiwanita-patient-portal-old'];
    const entries = new Map();
    const cache = {
        addAll: jest.fn(async urls => { if (failPrecache) throw new Error('precache failed'); urls.forEach(url => entries.set(new URL(url.url || url, 'https://example.test').href, { cached: url.url || url })); }),
        put: jest.fn(),
        match: jest.fn(async (request, options) => {
            const requested = new URL(request.url || request, 'https://example.test');
            return entries.get(requested.href) || (options?.ignoreSearch
                ? [...entries].find(([key]) => new URL(key).origin === requested.origin && new URL(key).pathname === requested.pathname)?.[1]
                : null);
        })
    };
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
        self, caches, Request: class { constructor(url) { this.url = url.url || url; this.method = 'GET'; } },
        Response: class {}, URL, fetch: jest.fn(() => Promise.reject(new Error('offline'))), clients: self.clients,
        console: { log() {}, error() {} }
    }, { filename: file });
    return { handlers, removed, caches, self, cache, entries };
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

test('staff worker serves only its current-version shell scripts from its atomic static cache', async () => {
    const worker = loadWorker('staff/public/sw.js');
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await install;
    const cached = [...worker.entries.keys()];
    expect(cached).toContain('https://example.test/staff/public/scripts/shell/bootstrap.js?v=v414');
    expect(cached).toContain('https://example.test/staff/public/scripts/main.js?v=v414');

    let current;
    worker.handlers.fetch({
        request: { url: 'https://example.test/staff/public/scripts/shell/bootstrap.js?v=v414', method: 'GET', mode: 'cors', headers: { get: () => '' } },
        respondWith: promise => { current = promise; }
    });
    await expect(current).resolves.toMatchObject({ cached: expect.anything() });

    let old;
    worker.handlers.fetch({
        request: { url: 'https://example.test/staff/public/scripts/shell/bootstrap.js?v=v413', method: 'GET', mode: 'cors', headers: { get: () => '' } },
        respondWith: promise => { old = promise; }
    });
    if (old) await expect(old).resolves.toBeNull();
    expect(worker.cache.match.mock.calls.some(([request]) => String(request.url || request).includes('v=v413'))).toBe(false);
});

test('staff credential dependency is in the verified shell cache and an exact-version miss reaches network', async () => {
    const worker = loadWorker('staff/public/sw.js');
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await install;
    const credential = 'https://example.test/staff/public/scripts/socket-credentials.js?v=v414';
    expect(worker.entries.has(credential)).toBe(true);
    worker.entries.delete(credential);
    let response;
    worker.handlers.fetch({
        clientId: 'current-shell',
        request: { url: credential, method: 'GET', mode: 'cors', headers: { get: () => '' } },
        respondWith: promise => { response = promise; }
    });
    await expect(response).rejects.toThrow('offline');
    expect(worker.cache.match).toHaveBeenCalledWith('/staff/public/scripts/socket-credentials.js?v=v414');
    expect(worker.cache.match.mock.calls.some(([, options]) => options?.ignoreSearch)).toBe(false);
});

test('old staff controller cannot mix cached canonical modules into a newer shell document', async () => {
    const worker = loadWorker('staff/public/sw.js');
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await install;
    const request = (clientId, url) => {
        let response;
        worker.handlers.fetch({
            clientId,
            request: { url: `https://example.test${url}`, method: 'GET', mode: 'cors', headers: { get: () => '' } },
            respondWith: promise => { response = promise; }
        });
        return response;
    };
    // The old worker sees the new document's first explicitly versioned script.
    expect(request('new-shell', '/staff/public/scripts/error-handler.js?v=v415')).toBeUndefined();
    expect(request('new-shell', '/staff/public/scripts/main.js')).toBeUndefined();
    // An overlapping request from the previous document must not re-authorize
    // stale canonical imports for the newer document on the same client.
    expect(request('new-shell', '/staff/public/scripts/error-handler.js?v=v414')).toBeDefined();
    expect(request('new-shell', '/staff/public/scripts/main.js')).toBeUndefined();

    // A separate current-version document may still use the immutable cache.
    expect(request('current-shell', '/staff/public/scripts/error-handler.js?v=v414')).toBeDefined();
    await expect(request('current-shell', '/staff/public/scripts/main.js'))
        .resolves.toMatchObject({ cached: '/staff/public/scripts/main.js?v=v414' });
    // An unversioned request with no proven owning document version fails open to the network, not an old cache.
    expect(request('', '/staff/public/scripts/main.js')).toBeUndefined();
});

test('patient worker update rotates cache namespace before adding new shell assets', () => {
    const source = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
    expect(source).not.toContain("const CACHE_VERSION = '20260924wave3'");
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
        expect(item).toMatch(/^\/[^?]+\?v=20260924wave3r1$/);
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

test('patient worker resolves every shell-owned static URL offline regardless of its live version query', async () => {
    const worker = loadWorker('public/sw.js');
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await install;
    const html = fs.readFileSync(path.join(root, 'public/patient-menu.html'), 'utf8');
    const urls = [...html.matchAll(/(?:src|href)="(\/(?:styles|scripts|images)\/[^"#]+)"/g)].map(match => match[1]);
    expect(urls.length).toBeGreaterThan(5);
    for (const url of urls) {
        let response;
        worker.handlers.fetch({ request: { url: `https://example.test${url}`, method: 'GET', mode: 'no-cors', headers: { get: () => '' } }, respondWith: promise => { response = promise; } });
        await expect(response).resolves.toMatchObject({ cached: expect.any(String) });
    }
});

test('patient worker never borrows a same-path asset from a foreign origin or another app', async () => {
    const worker = loadWorker('public/sw.js');
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await install;
    let foreign;
    worker.handlers.fetch({ request: { url: 'https://foreign.test/scripts/patient-session.js', method: 'GET', mode: 'no-cors', headers: { get: () => '' } },
        respondWith: promise => { foreign = promise; } });
    await expect(foreign).resolves.toBeNull();
    expect(worker.cache.match).not.toHaveBeenCalled();
    let staffResponded = false;
    worker.handlers.fetch({ request: { url: 'https://example.test/staff/public/scripts/main.js', method: 'GET', mode: 'no-cors', headers: { get: () => '' } },
        respondWith: () => { staffResponded = true; } });
    expect(staffResponded).toBe(false);
});

test('patient shell static import graph is fully precached for offline module evaluation', async () => {
    const worker = loadWorker('public/sw.js');
    let install;
    worker.handlers.install({ waitUntil: promise => { install = promise; } });
    await install;
    const cachedPaths = new Set([...worker.entries.keys()].map(url => new URL(url).pathname));
    const seen = new Set();
    const missing = [];
    const queue = ['/scripts/patient-menu-shell.js'];
    while (queue.length) {
        const url = queue.shift();
        if (seen.has(url)) continue;
        seen.add(url);
        if (!cachedPaths.has(url)) missing.push(url);
        const source = fs.readFileSync(path.join(root, 'public', url.slice(1)), 'utf8');
        for (const match of source.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)) {
            const dependency = new URL(match[1], `https://example.test${url}`).pathname;
            if (!seen.has(dependency)) queue.push(dependency);
        }
    }
    expect(missing).toEqual([]);
});
