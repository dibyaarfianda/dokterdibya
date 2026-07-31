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

    test('client errors are scrubbed, fingerprinted, bounded, and aggregated without raw stacks', () => {
        const clientRum = read('staff', 'public', 'scripts', 'rum.js');
        const serverRum = read('staff', 'backend', 'routes', 'rum.js');
        const errorHandler = read('staff', 'public', 'scripts', 'error-handler.js');

        expect(clientRum).toContain('var ERROR_BUFFER_SIZE = 20;');
        expect(clientRum).toContain('function scrubErrorText(value)');
        expect(clientRum).toContain('function stableHash(value)');
        expect(clientRum).toContain("trackError(event.reason, 'unhandled_rejection')");
        expect(serverRum).toContain('function sanitizeClientErrorText(value)');
        expect(serverRum).toContain('const clientErrorStore = {};');
        expect(serverRum).toContain('const MAX_ERRORS = 20;');
        expect(serverRum).toContain('body.errors.slice(0, MAX_ERRORS)');
        expect(errorHandler).toContain("window.__rum?.trackError?.({");
        expect(errorHandler).not.toContain("stack: error.stack,\n                url: window.location.href");
    });

    test('server publishes a report-only CSP and accepts sanitized violation reports', () => {
        const server = read('staff', 'backend', 'server.js');

        expect(server).toContain('helmet.contentSecurityPolicy({');
        expect(server).toContain('reportOnly: true');
        expect(server).toContain("reportUri: ['/api/csp-report']");
        expect(server).toContain("app.post('/api/csp-report'");
        expect(server).toContain("type: ['application/json', 'application/csp-report', 'application/reports+json']");
        expect(server).not.toContain("blockedUri: report['blocked-uri']");
    });

    test('notification navigation has no eval and only dispatches allowlisted actions', () => {
        const notifications = read('staff', 'public', 'scripts', 'shell', 'notifications.js');

        expect(notifications).not.toMatch(/\beval\s*\(/);
        expect(notifications).toContain('const NOTIFICATION_ACTIONS = Object.freeze({');
        expect(notifications).toContain('runNotificationNavigation(link)');
    });

    test('frontend auth and chat use shared token and role constants', () => {
        const auth = read('staff', 'public', 'scripts', 'auth.js');
        const chat = read('staff', 'public', 'scripts', 'chat-popup.js');
        const main = read('staff', 'public', 'scripts', 'main.js');
        const vpsAuth = read('staff', 'public', 'scripts', 'vps-auth-v2.js');
        const sundayClinic = read('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');
        const kantorSaya = read('staff', 'public', 'scripts', 'kantor-saya.js');
        const tanyaDokter = read('staff', 'public', 'scripts', 'tanya-dokter.js');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const html = read('staff', 'public', 'index-adminlte.html');
        const accessSources = [main, vpsAuth, sundayClinic, kantorSaya, tanyaDokter, html];

        expect(auth).toContain("import { TOKEN_KEY } from './vps-auth-v2.js';");
        expect(auth).toMatch(/import\s*\{[\s\S]*?ROLE_IDS,[\s\S]*?\}\s*from '\.\/role-constants\.js';/);
        expect(auth).not.toMatch(/DOKTER:\s*1/);
        expect(chat).toContain("import { ROLE_IDS } from './role-constants.js';");
        expect(chat).not.toMatch(/DOKTER:\s*1/);
        expect(main).not.toMatch(/role_id\s*===\s*1/);
        expect(bootstrap).toContain('window.staffRoleConstants = roleConstants;');
        expect(vpsAuth).toContain("import { isSuperadminUser } from './role-constants.js';");
        expect(sundayClinic).toContain("import { isSuperadminUser } from '../role-constants.js';");
        for (const source of accessSources) {
            expect(source).not.toMatch(/===\s*['"]dokter['"]/);
            expect(source).not.toMatch(/===\s*['"]superadmin['"]/);
        }
    });

    test('duplicate notification helpers are removed', () => {
        const notifications = read('staff', 'public', 'scripts', 'shell', 'notifications.js');

        expect((notifications.match(/function formatTimeAgo\(/g) || [])).toHaveLength(1);
        expect((notifications.match(/function escapeHtml\(/g) || [])).toHaveLength(0);
        expect(notifications).toContain("import { escapeHtml, escapeAttribute, sanitizeUrl } from '../safe-render.js';");
    });

    test('lazy monitoring pages update the shell title and finance uses the real nav id', () => {
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const main = read('staff', 'public', 'scripts', 'main.js');
        const descriptors = read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js');

        expect(patientTools).toContain("titleEl.textContent = 'Aktivitas Pasien';");
        expect(patientTools).toContain("titleEl.textContent = 'Aktivitas Demo';");
        expect(patientTools).toContain("window.dispatchStaffPageChanged?.('patient-activity');");
        expect(patientTools).toContain("window.dispatchStaffPageChanged?.('guest-activity');");
        expect(main).toContain("setTitleAndActive('Finance Analysis', 'nav-finance-analysis', 'finance-analysis');");
        expect(main).toContain("'nav-finance-analysis':                 () => showFinanceAnalysisPage(),");
        expect(descriptors).toContain("['finance-analysis', 'finance-analysis-page', 'nav-finance-analysis', 'Finance Analysis']");
        expect(main).not.toContain("'finance-analysis-nav':");
    });

    test('notification module uses the shared API and treats server content as untrusted', () => {
        const notifications = read('staff', 'public', 'scripts', 'shell', 'notifications.js');
        const featureLoader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');

        expect(notifications).toContain("import { staffApiRequest } from '../staff-api.js';");
        expect(notifications).toContain("import { escapeHtml, escapeAttribute, sanitizeUrl } from '../safe-render.js';");
        expect(notifications).not.toMatch(/\bfetch\s*\(/);
        expect(notifications).toContain('DOMPurify.sanitize');
        expect(notifications).toContain('normalizeNotificationIcon');
        expect(notifications).toContain('normalizeNotificationLink');
        expect(notifications).not.toContain('onclick="handleNotificationClick(${item.id}');
        expect(notifications).not.toContain('href="${item.link}"');
        expect(featureLoader).toContain("await import(`./notifications.js?v=${version}`);");
        expect(notifications).toContain('window.markAllNotificationsRead = markAllNotificationsRead;');
        expect(notifications).toContain('window.filterNotifications = filterNotifications;');
    });

    test('staff announcement queries keep an explicit stable response contract', () => {
        const route = read('staff', 'backend', 'routes', 'staff-announcements.js');

        expect(route).toContain('const STAFF_ANNOUNCEMENT_COLUMNS = [');
        expect(route).toContain("STAFF_ANNOUNCEMENT_COLUMNS.join(', ')");
        expect(route).not.toMatch(/SELECT\s+\*\s+FROM\s+staff_announcements/i);
    });

    test('hidden notification UI does not download and poll during shell startup', () => {
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const shellCss = read('staff', 'public', 'styles', 'staff-shell.css');

        expect(shellCss).toMatch(/#notification-dropdown\s*\{\s*display:\s*none\s*!important;/);
        expect(bootstrap).toContain("installLazyFeatureShim(globalName, 'notifications')");
        expect(bootstrap).not.toContain("ensureFeature('notifications')");
    });
});
