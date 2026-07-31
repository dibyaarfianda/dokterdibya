const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(absolute) : [absolute];
    });
}

describe('approved web hardening plan', () => {
    test('patient auth has one storage interface and 24-hour token issuance', () => {
        const session = read('public', 'scripts', 'patient-session.js');
        const auth = read('staff', 'backend', 'routes', 'patients-auth.js');
        const legacyAuth = read('staff', 'backend', 'routes', 'auth.js');

        expect(session).toContain('global.PatientSession');
        for (const method of ['getToken', 'setToken', 'getUser', 'setUser', 'clearAuth']) {
            expect(session).toMatch(new RegExp(`\\b${method}\\b`));
        }
        expect(auth).toContain("process.env.PATIENT_JWT_EXPIRES_IN || '24h'");
        expect(legacyAuth).toContain("process.env.PATIENT_JWT_EXPIRES_IN || '24h'");
        expect(auth).not.toMatch(/const JWT_EXPIRES_IN = '7d'/);
    });

    test('patient session migrates legacy tokens and keeps persistence explicit', () => {
        const source = read('public', 'scripts', 'patient-session.js');
        const createStorage = () => {
            const values = new Map();
            return {
                getItem: key => values.get(key) || null,
                setItem: (key, value) => values.set(key, String(value)),
                removeItem: key => values.delete(key)
            };
        };
        const window = {
            localStorage: createStorage(),
            sessionStorage: createStorage()
        };
        window.localStorage.setItem('patient_token', 'legacy-token');

        vm.runInNewContext(source, { window, console: { warn: jest.fn() } });

        expect(window.PatientSession.getToken()).toBe('legacy-token');
        expect(window.localStorage.getItem('vps_auth_token')).toBe('legacy-token');
        expect(window.localStorage.getItem('patient_token')).toBeNull();

        window.PatientSession.setToken('session-token');
        expect(window.sessionStorage.getItem('vps_auth_token')).toBe('session-token');
        expect(window.localStorage.getItem('vps_auth_token')).toBeNull();

        window.PatientSession.clearAuth();
        expect(window.PatientSession.getToken()).toBeNull();
    });

    test('patient pages do not bypass the centralized token interface', () => {
        const publicRoot = path.join(repoRoot, 'public');
        const sources = walk(publicRoot)
            .filter(file => /\.(?:html|js)$/.test(file))
            .filter(file => !file.endsWith(path.join('scripts', 'patient-session.js')));

        for (const file of sources) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).not.toMatch(
                /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['"]vps_auth_token['"]/
            );
        }
    });

    test('confirmed rendering sinks use text nodes instead of interpolated HTML', () => {
        const medicalExam = read('staff', 'public', 'scripts', 'medical-exam.js');
        const patientUtils = read('public', 'scripts', 'patient-utils.js');

        expect(medicalExam).not.toContain('el.innerHTML = `<span class="badge badge-secondary mr-2">${patientId}</span>${patient.name}`');
        expect(medicalExam).toContain("badge.textContent = patientId;");
        expect(patientUtils).not.toContain('toast.innerHTML');
        expect(patientUtils).toContain('messageNode.textContent = String(message);');
    });

    test('production mock modes cannot create persistent fake credentials', () => {
        for (const file of ['fertility-calendar.html', 'contraction-timer.html', 'kick-counter.html', 'pregnancy-tracker.html']) {
            const source = read('public', file);
            expect(source).toContain('isLocalMockHost');
            expect(source).not.toMatch(/localStorage\.setItem\('vps_auth_token',\s*'mock-/);
        }

        const patientMenuShell = read('public', 'scripts', 'patient-menu-shell.js');
        expect(patientMenuShell).toContain('function isLocalDemoHost()');
        expect(patientMenuShell).toMatch(/function startGuestMode\(\) \{\s*if \(!isLocalDemoHost\(\)\)/);
        expect(patientMenuShell).toMatch(/function isGuestMode\(\) \{\s*if \(!isLocalDemoHost\(\)\)/);
    });

    test('backend hardening contracts are active', () => {
        const server = read('staff', 'backend', 'server.js');
        const pdf = read('staff', 'backend', 'routes', 'pdf.js');
        const slo = read('staff', 'backend', 'routes', 'slo.js');
        const dbMonitor = read('staff', 'backend', 'middleware', 'dbMonitor.js');
        const rum = read('staff', 'backend', 'routes', 'rum.js');

        expect(server).toContain('maxHttpBufferSize: 1e6');
        expect((server.match(/app\.get\('\/api\/patients'/g) || [])).toHaveLength(0);
        expect(server).toContain("app.use('/api/rum', rumPayloadLimiter");
        expect(pdf).toContain("code: 'RECEIPT_ENDPOINT_RETIRED'");
        expect(pdf).not.toContain('Generate visit receipt PDF');
        expect(slo).toContain("router.get('/', verifyToken, requireSuperadmin");
        expect(slo).toContain('db.slowQueriesLast15m');
        expect(dbMonitor).toContain('slowQueriesLast15m');
        expect(rum).toContain('ALLOWED_METRICS');
        expect(rum).toContain('MAX_API_CALLS');
        expect(rum).not.toContain('for (const [key, value] of Object.entries(body.metrics))');
    });

    test('performance checks are strict and enforce page budgets', () => {
        const perf = read('staff', 'backend', 'scripts', 'perf-budget-check.js');

        expect(perf).toContain("'--allow-unreachable'");
        expect(perf).toContain("'--page-url'");
        expect(perf).toContain('WARMUP_RUNS = 3');
        expect(perf).toContain('MEASURED_RUNS = 20');
        expect(perf).toContain('puppeteer');
        expect(perf).not.toContain('[SKIP]');
    });

    test('patient PWA has one canonical identity, worker, and cache version', () => {
        const canonicalManifest = JSON.parse(read('public', 'patient-portal.webmanifest'));
        const compatibilityManifest = JSON.parse(read('public', 'sisiwanita.webmanifest'));
        const sw = read('public', 'sw.js');
        const compatibilitySw = read('public', 'sisiwanita-sw.js');
        const patientMenu = read('public', 'patient-menu.html');
        const landing = read('public', 'sisiwanita', 'index.html');

        expect(canonicalManifest.id).toBe('/sisiwanita');
        expect(canonicalManifest.scope).toBe('/');
        expect(canonicalManifest.start_url).toContain('/patient-menu.html');
        expect(compatibilityManifest).toEqual(canonicalManifest);
        expect(sw).toContain("const CACHE_VERSION = '20260731hardening1'");
        expect(compatibilitySw.trim()).toBe("importScripts('/sw.js?v=20260731hardening1');");
        expect(patientMenu).toContain('/patient-portal.webmanifest?v=20260731hardening1');
        expect(landing).toContain('/patient-portal.webmanifest?v=20260731hardening1');
        expect(landing).toContain("navigator.serviceWorker.register('/sw.js?v=20260731hardening1'");
        expect(sw).not.toMatch(/cachedResponse \|\| caches\.match\('\/patient-menu\.html'\)/);
    });

    test('public HTML allows zoom and does not request an empty image URL', () => {
        const htmlFiles = walk(path.join(repoRoot, 'public')).filter(file => file.endsWith('.html'));
        for (const file of htmlFiles) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).not.toMatch(/maximum-scale\s*=\s*1(?:\.0)?/i);
            expect(source).not.toMatch(/user-scalable\s*=\s*no/i);
            expect(source).not.toMatch(/<img\b[^>]*\bsrc\s*=\s*(?:"\s*"|'\s*')/i);
        }
    });

    test('staff cache version is synchronized at v362', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const sw = read('staff', 'public', 'sw.js');

        expect(html).toContain("window.STAFF_CACHE_VERSION = 'v362'");
        expect(sw).toContain("const STAFF_PWA_VERSION = 'v362'");
    });
});
