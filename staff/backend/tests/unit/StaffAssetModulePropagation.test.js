const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const puppeteer = require('puppeteer');
const { stageStaffAssetRelease } = require('../../services/staffAssetRelease');
const { renderStaffAssetNginx } = require('../../services/staffAssetNginxConfig');

const scriptBase = '/staff/public/scripts/';
const invalidQueries = ['v', 'V', 'V=', 'v=', 'v=garbage', 'V=v413', 'v=v0', 'v=v0413', 'v=v413&v=v414', 'v=v413&V=v414', 'V&v=v413', 'v=v413&v', 'v=v413%2f..', 'v=v413%26v=v414', 'v=v999'];
const bodies = version => ({
    'root.js': `import mid from './mid.js'; export default ['root-${version}', ...mid];`,
    'mid.js': `import leaf from './leaf.js'; export default ['mid-${version}', ...leaf];`,
    'leaf.js': `export default ['leaf-${version}'];`,
    'staff-root.js': `import './socket-credentials.js'; export default async () => ['staff-root-${version}', globalThis.credentialSentinel, (await import('./patient-list-pages.js')).default];`,
    'realtime-sync.js': `import '/scripts/socket-credentials.js'; export default async () => ['legacy-root-${version}', globalThis.credentialSentinel, (await import('/scripts/patient-list-pages.js')).default];`,
    'legacy/patient-tools.js': `globalThis.loadLegacyPatientList = async () => (await import('/scripts/patient-list-pages.js')).default;`,
    'socket-credentials.js': `globalThis.credentialSentinel = 'credential-${version}';`,
    'patient-list-pages.js': `export default 'patient-list-${version}';`
});

// A small map interpreter for the loopback fixture; Nginx itself executes these maps in CI.
function routeState(args, referrer, origin, requestUri = '') {
    const { mapConfig } = renderStaffAssetNginx({ releaseBase: '/releases', currentRoot: '/current' });
    const arg = args.match(/(?:^|&)v=([^&]*)/i);
    const vars = { args, arg_v: arg ? arg[1] : '', request_uri: requestUri,
        http_referer: referrer.startsWith(`${origin}/`) ? referrer.replace(origin, 'https://dokterdibya.com') : referrer };
    const expand = value => value.replace(/\$(\w+)/g, (_, key) => vars[key] || '');
    for (const block of mapConfig.matchAll(/map\s+("[^"]*"|\S+)\s+\$(\w+)\s*\{([^}]+)\}/g)) {
        const input = expand(block[1].replace(/^"|"$/g, ''));
        let result;
        let fallback;
        for (const row of block[3].matchAll(/^\s*("[^"]*"|\S+)\s+("[^"]*"|\S+);\s*$/gm)) {
            const key = row[1].replace(/^"|"$/g, '');
            const value = row[2].replace(/^"|"$/g, '');
            if (key === 'default') { fallback = value; continue; }
            const insensitive = key.startsWith('~*');
            const match = key.startsWith('~') ? input.match(new RegExp(key.slice(insensitive ? 2 : 1), insensitive ? 'i' : '')) : null;
            if (key === input || match) {
                if (match) match.slice(1).forEach((capture, index) => { vars[index + 1] = capture; });
                result = expand(value); break;
            }
        }
        vars[block[2]] = result === undefined ? expand(fallback) : result;
    }
    return vars;
}

async function loopbackFixture() {
    const trace = [];
    let origin;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, origin);
        const state = routeState(url.search.slice(1), req.headers.referer || '', origin, req.url);
        let status = 200;
        let body;
        let servedVersion = null;
        if (url.pathname === '/staff/public/index.html') {
            res.setHeader('Content-Type', 'text/html');
            body = '<!doctype html><title>Staff module fixture</title>';
        } else if (url.pathname === '/staff/public/sw.js') {
            res.setHeader('Content-Type', 'application/javascript');
            body = fs.readFileSync(path.join(__dirname, '../../../public/sw.js'), 'utf8');
        } else if (url.pathname === '/staff/public/old-sw.js') {
            res.setHeader('Content-Type', 'application/javascript');
            body = "self.addEventListener('install', event => event.waitUntil(self.skipWaiting())); self.addEventListener('activate', event => event.waitUntil(self.clients.claim())); self.addEventListener('fetch', () => {});";
        } else if (url.pathname.startsWith(scriptBase) && url.pathname.endsWith('.js')) {
            if (state.staff_module_redirect_version) {
                status = 307;
                res.setHeader('Location', `${url.pathname}?v=${state.staff_module_redirect_version}`);
                body = '';
            } else {
                servedVersion = state.staff_asset_root === '/current' ? 'current' : state.staff_asset_root.split('/').pop();
                body = ['current', 'v413', 'v414'].includes(servedVersion) ? bodies(servedVersion)[url.pathname.slice(scriptBase.length)] : undefined;
                if (!body && servedVersion === 'v414') body = '/* precache fixture */';
                if (!body) { status = 404; servedVersion = null; body = 'not found'; }
                res.setHeader('Content-Type', 'application/javascript');
            }
        } else if (url.pathname.startsWith('/staff/public/') && url.search === '?v=v414') {
            body = 'fixture asset';
        } else if (url.pathname.startsWith('/scripts/') && url.pathname.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            if (state.staff_legacy_redirect) {
                status = 307;
                res.setHeader('Location', state.staff_legacy_redirect);
                body = '';
            } else {
                body = url.pathname === '/scripts/socket-credentials.js' ? "globalThis.credentialSentinel = 'credential-patient-current';"
                    : url.pathname === '/scripts/patient-list-pages.js' ? "export default 'patient-list-patient-current';" : undefined;
                if (!body) { status = 404; body = 'not found'; }
            }
        } else { status = 404; body = 'not found'; }
        trace.push({ url: `${origin}${req.url}`, referrer: req.headers.referer || '', status, servedVersion });
        res.setHeader('Cache-Control', 'no-store');
        res.writeHead(status); res.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, trace, close: () => new Promise(resolve => server.close(resolve)) };
}

async function loadVersion(browser, origin, version, { staffGraph = false, workerCacheMiss = false, legacyGraph = false, oldWorker = false } = {}) {
    const page = await browser.newPage();
    await page.setBypassServiceWorker(!workerCacheMiss && !oldWorker);
    await page.setCacheEnabled(false);
    const trace = [];
    const pending = [];
    page.on('response', response => {
        if (!response.url().includes(scriptBase)) return;
        pending.push((async () => {
            const status = response.status();
            const body = status === 200 ? await response.text() : '';
            trace.push({ url: response.url(), referrer: response.request().headers().referer || '', status, body });
        })());
    });
    try {
        await page.goto(`${origin}/staff/public/index.html`);
        if (workerCacheMiss) {
            await page.evaluate(async () => { await navigator.serviceWorker.register('/staff/public/sw.js', { scope: '/staff/public/' }); await navigator.serviceWorker.ready; });
            await page.waitForFunction(() => !!navigator.serviceWorker.controller);
            await page.evaluate(async () => {
                const cache = await caches.open('dokterdibya-staff-v414-static');
                await Promise.all(['socket-credentials.js', 'patient-list-pages.js'].map(name =>
                    cache.delete(`/staff/public/scripts/${name}?v=v414`)));
            });
        }
        if (oldWorker) {
            await page.evaluate(async () => { await navigator.serviceWorker.register('/staff/public/old-sw.js', { scope: '/staff/public/' }); await navigator.serviceWorker.ready; });
            await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/staff/public/old-sw.js'));
        }
        const entry = `${origin}${scriptBase}${legacyGraph ? 'realtime-sync.js' : staffGraph ? 'staff-root.js' : 'root.js'}?v=${version}`;
        const result = await page.evaluate(async url => {
            const module = await import(url);
            return typeof module.default === 'function' ? module.default() : module.default;
        }, entry);
        await Promise.all(pending);
        return { result, trace };
    } finally { await page.close(); }
}

function verifyBrowserTrace(trace, version) {
    const served = trace.filter(item => item.status === 200);
    assert.equal(served.length, 3);
    assert.deepEqual(served.map(item => new URL(item.url).pathname.split('/').pop()).sort(), ['leaf.js', 'mid.js', 'root.js']);
    for (const item of served) {
        assert.equal(new URL(item.url).search, `?v=${version}`);
        assert.match(item.body, new RegExp(`-${version}`));
        assert.doesNotMatch(item.body, /-current/);
    }
    const redirects = trace.filter(item => item.status === 307);
    assert.equal(redirects.length, 2);
    for (const item of redirects) {
        assert.equal(new URL(item.url).search, '');
        assert.equal(new URL(item.referrer).search, `?v=${version}`);
    }
}

if (typeof describe === 'function') {
    describe('Chromium Staff module release propagation', () => {
        let fixture;
        let browser;
        beforeAll(async () => {
            fixture = await loopbackFixture();
            browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        }, 30000);
        afterAll(async () => { if (browser) await browser.close(); if (fixture) await fixture.close(); });

        test.each(['v413', 'v414'])('keeps %s through root, mid and leaf imports', async version => {
            fixture.trace.length = 0;
            const { result, trace } = await loadVersion(browser, fixture.origin, version);
            expect(result).toEqual([`root-${version}`, `mid-${version}`, `leaf-${version}`]);
            verifyBrowserTrace(trace, version);
            const served = fixture.trace.filter(item => item.servedVersion);
            expect(served).toHaveLength(3);
            expect(served.every(item => item.servedVersion === version)).toBe(true);
        }, 30000);

        test.each(['v413', 'v414'])('keeps %s Staff credentials and lazy patient-list in one release with worker disabled', async version => {
            fixture.trace.length = 0;
            const { result, trace } = await loadVersion(browser, fixture.origin, version, { staffGraph: true });
            expect(result).toEqual([`staff-root-${version}`, `credential-${version}`, `patient-list-${version}`]);
            expect(trace.filter(item => item.status === 200).map(item => new URL(item.url).search)).toEqual(['?v=' + version, '?v=' + version, '?v=' + version]);
            expect(fixture.trace.some(item => new URL(item.url).pathname.startsWith('/scripts/'))).toBe(false);
            expect(fixture.trace.filter(item => item.servedVersion && /\/(?:staff-root|socket-credentials|patient-list-pages)\.js$/.test(new URL(item.url).pathname)).every(item => item.servedVersion === version)).toBe(true);
        }, 30000);

        test.each(['v413', 'v414'])('keeps %s Staff credentials and lazy patient-list in one release after current worker cache misses', async version => {
            fixture.trace.length = 0;
            const { result, trace } = await loadVersion(browser, fixture.origin, version, { staffGraph: true, workerCacheMiss: true });
            expect(result).toEqual([`staff-root-${version}`, `credential-${version}`, `patient-list-${version}`]);
            expect(trace.filter(item => item.status === 200)).toHaveLength(3);
            expect(trace.filter(item => item.status === 200).every(item => new URL(item.url).search === `?v=${version}`)).toBe(true);
            expect(fixture.trace.some(item => new URL(item.url).pathname.startsWith('/scripts/'))).toBe(false);
        }, 30000);

        test('v414 worker bridges actual v413 root import shapes without patient-root network traffic', async () => {
            fixture.trace.length = 0;
            const { result } = await loadVersion(browser, fixture.origin, 'v413', { legacyGraph: true, workerCacheMiss: true });
            expect(result).toEqual(['legacy-root-v413', 'credential-v414', 'patient-list-v413']);
            expect(fixture.trace.some(item => new URL(item.url).pathname === '/staff/public/scripts/socket-credentials.js'
                && new URL(item.url).search === '?v=v414' && item.servedVersion === 'v414')).toBe(true);
            expect(fixture.trace.some(item => new URL(item.url).pathname === '/staff/public/scripts/patient-list-pages.js'
                && new URL(item.url).search === '?v=v413' && item.servedVersion === 'v413')).toBe(true);
            expect(fixture.trace.some(item => new URL(item.url).pathname.startsWith('/scripts/'))).toBe(false);
        }, 30000);

        test('v414 worker bridges v413 classic patient-tools dynamic import', async () => {
            const page = await browser.newPage();
            fixture.trace.length = 0;
            try {
                await page.goto(`${fixture.origin}/staff/public/index.html`);
                await page.evaluate(async () => { await navigator.serviceWorker.register('/staff/public/sw.js', { scope: '/staff/public/' }); await navigator.serviceWorker.ready; });
                await page.waitForFunction(() => !!navigator.serviceWorker.controller);
                fixture.trace.length = 0;
                const result = await page.evaluate(async origin => {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = `${origin}/staff/public/scripts/legacy/patient-tools.js?v=v413`;
                        script.onload = resolve; script.onerror = reject;
                        document.head.appendChild(script);
                    });
                    return globalThis.loadLegacyPatientList();
                }, fixture.origin);
                expect(result).toBe('patient-list-v413');
                expect(fixture.trace.some(item => new URL(item.url).pathname === '/staff/public/scripts/patient-list-pages.js'
                    && new URL(item.url).search === '?v=v413' && item.servedVersion === 'v413')).toBe(true);
                expect(fixture.trace.some(item => new URL(item.url).pathname.startsWith('/scripts/'))).toBe(false);
            } finally { await page.close(); }
        }, 30000);

        test.each([
            ['disabled', false], ['old passthrough', true]
        ])('edge bridge preserves v413 legacy graph with %s service worker', async (_, oldWorker) => {
            fixture.trace.length = 0;
            const { result } = await loadVersion(browser, fixture.origin, 'v413', { legacyGraph: true, oldWorker });
            expect(result).toEqual(['legacy-root-v413', 'credential-v414', 'patient-list-v413']);
            const rootRequests = fixture.trace.filter(item => new URL(item.url).pathname.startsWith('/scripts/'));
            expect(rootRequests).toHaveLength(2);
            expect(rootRequests.every(item => item.status === 307)).toBe(true);
            expect(fixture.trace.some(item => new URL(item.url).pathname === '/staff/public/scripts/patient-list-pages.js'
                && new URL(item.url).search === '?v=v413' && item.servedVersion === 'v413')).toBe(true);
        }, 30000);

        test.each(invalidQueries)('fails closed for raw version query %s', async query => {
            const response = await fetch(`${fixture.origin}${scriptBase}leaf.js?${query}`);
            expect(response.status).toBe(404);
        });

        test.each(['https://external.test/staff/public/scripts/root.js?v=v413', 'https://dokterdibya.com.evil.test/staff/public/scripts/root.js?v=v413', 'https://dokterdibya.com/staff/public/scripts/root.js?v=v413&extra=x'])('does not propagate untrusted/extra-query referrer %s', async referrer => {
            const response = await fetch(`${fixture.origin}${scriptBase}leaf.js`, { headers: { Referer: referrer }, redirect: 'manual' });
            expect(response.status).toBe(200);
            expect(await response.text()).toContain('leaf-current');
        });

        test('does not copy arbitrary referrer query parameters or redirect nonempty request queries', async () => {
            const referrer = `${fixture.origin}${scriptBase}root.js?v=v413`;
            const response = await fetch(`${fixture.origin}${scriptBase}leaf.js?foo=1`, { headers: { Referer: referrer }, redirect: 'manual' });
            expect(response.status).toBe(200);
            expect(await response.text()).toContain('leaf-current');
        });
    });
}

// This file is also the standalone synthetic Ubuntu CI probe. It never reads Staff credentials.
async function prepareNginx(prefix) {
    assert.equal(process.platform, 'linux', 'The real Nginx fixture requires Linux');
    assert.match(prefix, /^\/[A-Za-z0-9/._-]+$/);
    assert(!prefix.split('/').includes('..'));
    const currentRoot = path.join(prefix, 'current');
    const releaseBase = path.join(prefix, 'releases');
    async function writeTree(root, version) {
        const publicRoot = path.join(root, 'staff/public');
        await fs.promises.mkdir(path.join(publicRoot, 'scripts'), { recursive: true });
        for (const [name, body] of Object.entries(bodies(version))) {
            const destination = path.join(publicRoot, 'scripts', name);
            await fs.promises.mkdir(path.dirname(destination), { recursive: true });
            await fs.promises.writeFile(destination, body);
        }
        await fs.promises.writeFile(path.join(publicRoot, 'index.html'), `<!doctype html><title>Staff ${version}</title>`);
        await fs.promises.writeFile(path.join(publicRoot, 'sw.js'), `// sw-${version}\n`);
        await fs.promises.writeFile(path.join(publicRoot, 'fixture.css'), `/* style-${version} */\n`);
    }
    await writeTree(currentRoot, 'current');
    await fs.promises.mkdir(path.join(currentRoot, 'public/scripts'), { recursive: true });
    await fs.promises.writeFile(path.join(currentRoot, 'public/scripts/socket-credentials.js'), "globalThis.credentialSentinel = 'credential-patient-current';");
    await fs.promises.writeFile(path.join(currentRoot, 'public/scripts/patient-list-pages.js'), "export default 'patient-list-patient-current';");
    await fs.promises.writeFile(path.join(currentRoot, 'public/scripts/other.js'), "export default 'other-patient-current';");
    await fs.promises.writeFile(path.join(currentRoot, 'staff/public/old-sw.js'), "self.addEventListener('install', event => event.waitUntil(self.skipWaiting())); self.addEventListener('activate', event => event.waitUntil(self.clients.claim())); self.addEventListener('fetch', () => {});");
    for (const version of ['v413', 'v414']) {
        const repositoryRoot = path.join(prefix, `source-${version}`);
        await writeTree(repositoryRoot, version);
        await stageStaffAssetRelease({ repositoryRoot, releaseBase, version, sourceCommit: 'a'.repeat(40) });
    }
    // API ownership is deliberately outside the included Staff block.
    await fs.promises.writeFile(path.join(prefix, 'nginx.conf'), `pid ${prefix}/nginx.pid;
error_log ${prefix}/error.log;
events { worker_connections 128; }
http {
    include /etc/nginx/mime.types;
    access_log ${prefix}/access.log;
    include ${prefix}/map.conf;
    server {
        listen 127.0.0.1:443 ssl;
        server_name dokterdibya.com;
        ssl_certificate ${prefix}/fixture.crt;
        ssl_certificate_key ${prefix}/fixture.key;
        include ${prefix}/location.conf;
        location = /api/health { return 200 "current-api"; }
        location ~ [.]js$ {
            root ${prefix}/current/public;
            add_header Cache-Control "no-store, no-cache, must-revalidate" always;
            try_files $uri =404;
        }
        location / { return 404; }
    }
}
`);
}

async function probeNginx(prefix) {
    const certificate = fs.readFileSync(path.join(prefix, 'fixture.crt'));
    const spki = new crypto.X509Certificate(certificate).publicKey.export({ type: 'spki', format: 'der' });
    const pin = crypto.createHash('sha256').update(spki).digest('base64');
    const origin = 'https://dokterdibya.com';
    const proxyRequests = [];
    const upstream = http.createServer((req, res) => {
        proxyRequests.push({ url: req.url, headers: req.headers });
        res.end('current-sunday-proxy');
    });
    await new Promise((resolve, reject) => { upstream.once('error', reject); upstream.listen(3000, '127.0.0.1', resolve); });
    let browser;
    const trace = [];
    const request = (uri, referrer) => new Promise((resolve, reject) => {
        const req = https.get({ hostname: '127.0.0.1', port: 443, servername: 'dokterdibya.com',
            ca: certificate, path: uri, headers: { Host: 'dokterdibya.com', ...(referrer ? { Referer: referrer } : {}) } }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
        });
        req.on('error', reject);
    });
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server',
            '--host-resolver-rules=MAP dokterdibya.com 127.0.0.1', `--ignore-certificate-errors-spki-list=${pin}`] });
        for (const version of ['v413', 'v414']) {
            const loaded = await loadVersion(browser, origin, version);
            assert.deepEqual(loaded.result, [`root-${version}`, `mid-${version}`, `leaf-${version}`]);
            verifyBrowserTrace(loaded.trace, version);
            trace.push({ version, modules: loaded.trace });
            const css = await request(`/staff/public/fixture.css?v=${version}`);
            assert.equal(css.status, 200);
            assert.equal(css.body, `/* style-${version} */\n`);
            assert.equal(css.headers['cache-control'], 'public, max-age=31536000, immutable');
        }
        for (const query of invalidQueries) {
            const response = await request(`${scriptBase}leaf.js?${query}`);
            assert.equal(response.status, 404, query);
            assert(!response.body.includes('leaf-current'), query);
        }
        for (const query of ['', '?foo=1', '?preview=x&vfoo=x']) {
            const response = await request(`${scriptBase}leaf.js${query}`);
            assert.equal(response.status, 200);
            assert.equal(response.body, bodies('current')['leaf.js']);
            assert.equal(response.headers['cache-control'], 'no-cache, must-revalidate');
        }
        for (const referrer of ['https://external.test/staff/public/scripts/root.js?v=v413', 'https://dokterdibya.com.evil.test/staff/public/scripts/root.js?v=v413', `${origin}${scriptBase}root.js?v=v413&extra=x`]) {
            const response = await request(`${scriptBase}leaf.js`, referrer);
            assert.equal(response.status, 200);
            assert.equal(response.body, bodies('current')['leaf.js']);
        }
        const redirect = await request(`${scriptBase}leaf.js`, `${origin}${scriptBase}mid.js?v=v413`);
        assert.equal(redirect.status, 307);
        assert.equal(new URL(redirect.headers.location, origin).href, `${origin}${scriptBase}leaf.js?v=v413`);
        const nonempty = await request(`${scriptBase}leaf.js?foo=1`, `${origin}${scriptBase}mid.js?v=v413`);
        assert.equal(nonempty.status, 200);
        assert.equal(nonempty.body, bodies('current')['leaf.js']);
        for (const oldWorker of [false, true]) {
            const loaded = await loadVersion(browser, origin, 'v413', { legacyGraph: true, oldWorker });
            assert.deepEqual(loaded.result, ['legacy-root-v413', 'credential-v414', 'patient-list-v413']);
        }
        for (const [uri, target] of [
            ['/scripts/socket-credentials.js', '/staff/public/scripts/socket-credentials.js?v=v414'],
            ['/scripts/patient-list-pages.js', '/staff/public/scripts/patient-list-pages.js?v=v413']
        ]) {
            const redirect = await request(uri, `${origin}${scriptBase}realtime-sync.js?v=v413`);
            assert.equal(redirect.status, 307);
            assert.equal(new URL(redirect.headers.location, origin).href, `${origin}${target}`);
            assert.match(redirect.headers['cache-control'], /(?:^|,\s*)no-store(?:,|$)/);
        }
        for (const uri of ['/scripts/socket-credentials.js', '/scripts/patient-list-pages.js', '/scripts/other.js']) {
            for (const referrer of ['', `${origin}/public/scripts/patient-session.js?v=v413`, 'https://sisiwanita.id/public/patient-menu.html', `${origin}${scriptBase}realtime-sync.js?v=v414`, `${origin}${scriptBase}realtime-sync.js?v=v413&x=1`, 'https://external.test/staff/public/scripts/realtime-sync.js?v=v413']) {
                const response = await request(uri, referrer);
                assert.equal(response.status, 200);
                assert.equal(response.headers['cache-control'], 'no-store, no-cache, must-revalidate');
                assert.match(response.body, /patient-current/);
            }
        }
        const nonexact = await request('/scripts/socket-credentials.js?x=1', `${origin}${scriptBase}realtime-sync.js?v=v413`);
        assert.equal(nonexact.status, 200);
        assert.equal(nonexact.headers['cache-control'], 'no-store, no-cache, must-revalidate');
        assert.match(nonexact.body, /credential-patient-current/);
        const unrelated = await request('/scripts/other.js', `${origin}${scriptBase}realtime-sync.js?v=v413`);
        assert.equal(unrelated.status, 200);
        assert.match(unrelated.body, /other-patient-current/);
        for (const uri of ['/staff/public/index.html', '/staff/public/sw.js', '/staff/public/sunday-clinic.html']) {
            for (const query of ['', '?v=v413', '?v=v999', '?v=']) {
                const response = await request(uri + query);
                assert.equal(response.status, 200, uri + query);
                assert.match(response.headers['cache-control'], /no-store/);
                assert.match(response.body, /current/);
            }
        }
        assert.equal(proxyRequests.length, 4);
        for (const entry of proxyRequests) {
            assert.equal(entry.headers.host, 'dokterdibya.com');
            assert.equal(entry.headers['x-real-ip'], '127.0.0.1');
            assert.equal(entry.headers['x-forwarded-for'], '127.0.0.1');
            assert.equal(entry.headers['x-forwarded-proto'], 'https');
        }
        assert.equal((await request('/api/health?v=v413')).body, 'current-api');
        for (const uri of ['/patient-dashboard.html?v=v413', '/docboard/?v=v413', '/uploads/file.js?v=v413', '/socket.io/?v=v413']) assert.equal((await request(uri)).status, 404);
        process.stdout.write(`${JSON.stringify({ status: 'passed', trace }, null, 2)}\n`);
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => upstream.close(resolve));
    }
}

if (require.main === module) {
    const [mode, prefix] = process.argv.slice(2);
    const action = mode === '--prepare-nginx' ? prepareNginx : mode === '--probe-nginx' ? probeNginx : null;
    if (!action || !prefix) { process.stderr.write('Expected --prepare-nginx or --probe-nginx and a disposable prefix\n'); process.exitCode = 1; }
    else action(path.resolve(prefix)).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}
