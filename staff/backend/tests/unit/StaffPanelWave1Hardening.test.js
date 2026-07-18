const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('staff panel wave 1 hardening contracts', () => {
    test('bootstrap is the only versioned ESM entry and all transitive imports are canonical', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const main = read('staff', 'public', 'scripts', 'main.js');
        const helpers = read('staff', 'public', 'scripts', 'shell', 'module-helpers.js');
        const moduleEntries = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(match => match[1]);

        expect(moduleEntries).toHaveLength(1);
        expect(moduleEntries[0]).toMatch(/^scripts\/shell\/bootstrap\.js\?v=/);
        expect(bootstrap).not.toMatch(/import\([^\n]+\?v=/);
        expect(main).not.toMatch(/^import .*\?v=.*$/m);
        expect(helpers).toContain('const specifier = new URL(path, importBaseUrl).href;');
        expect(helpers).not.toContain('window.__assetVersion');
    });

    test('all direct local staff assets use the shell cache version', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const version = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/)?.[1];
        const localAssetVersions = [...html.matchAll(/(?:src|href)="(?:\.?\/)?(?:staff\/public\/)?(?:scripts|styles|sounds|icons|favicon|apple-touch-icon|android-chrome|manifest)[^"?]*\?v=([^"&]+)"/g)]
            .map(match => match[1]);

        expect(version).toBeTruthy();
        expect(localAssetVersions.length).toBeGreaterThan(10);
        expect(new Set(localAssetVersions)).toEqual(new Set([version]));
    });

    test('service worker never caches authenticated API responses', () => {
        const sw = read('staff', 'public', 'sw.js');

        expect(sw).not.toContain('CACHEABLE_API_ROUTES');
        expect(sw).not.toMatch(/networkFirst\(request\)[\s\S]{0,300}\/api\/patients/);
        expect(sw).toContain("if (url.pathname.startsWith('/api/')) {");
    });

    test('observability summaries require token and superadmin while health stays minimal', () => {
        const systemRoutes = read('staff', 'backend', 'routes', 'system.js');
        const rumRoutes = read('staff', 'backend', 'routes', 'rum.js');

        expect(systemRoutes).toContain("router.get('/api/metrics', verifyToken, requireSuperadmin");
        expect(rumRoutes).toContain("router.get('/summary', verifyToken, requireSuperadmin");
        expect(systemRoutes).not.toContain('activeConnectionCount:');
        expect(systemRoutes).not.toContain('system: metrics.system');
    });

    test('RUM endpoints are stored as canonical pathnames', () => {
        const clientRum = read('staff', 'public', 'scripts', 'rum.js');
        const serverRum = read('staff', 'backend', 'routes', 'rum.js');

        expect(clientRum).toContain('function normalizeApiPath(endpoint)');
        expect(clientRum).toContain('new URL(endpoint, window.location.origin)');
        expect(serverRum).toContain('function normalizeApiPath(endpoint)');
        expect(serverRum).toContain("recordMetric('api:' + ep");
    });

    test('notification navigation has no eval and only dispatches allowlisted actions', () => {
        const html = read('staff', 'public', 'index-adminlte.html');

        expect(html).not.toMatch(/\beval\s*\(/);
        expect(html).toContain('const NOTIFICATION_ACTIONS = Object.freeze({');
        expect(html).toContain('runNotificationNavigation(link)');
    });

    test('frontend auth and chat use shared token and role constants', () => {
        const auth = read('staff', 'public', 'scripts', 'auth.js');
        const chat = read('staff', 'public', 'scripts', 'chat-popup.js');
        const main = read('staff', 'public', 'scripts', 'main.js');

        expect(auth).toContain("import { TOKEN_KEY } from './vps-auth-v2.js';");
        expect(auth).toMatch(/import\s*\{[\s\S]*?ROLE_IDS,[\s\S]*?\}\s*from '\.\/role-constants\.js';/);
        expect(auth).not.toMatch(/DOKTER:\s*1/);
        expect(chat).toContain("import { ROLE_IDS } from './role-constants.js';");
        expect(chat).not.toMatch(/DOKTER:\s*1/);
        expect(main).not.toMatch(/role_id\s*===\s*1/);
    });

    test('duplicate notification helpers are removed', () => {
        const html = read('staff', 'public', 'index-adminlte.html');

        expect((html.match(/function formatTimeAgo\(/g) || [])).toHaveLength(1);
        expect((html.match(/function escapeHtml\(/g) || [])).toHaveLength(1);
    });
});
