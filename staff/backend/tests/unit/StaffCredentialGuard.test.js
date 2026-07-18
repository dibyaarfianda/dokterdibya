const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('staff credential guard sources', () => {
    test('global getAuthToken resolves local, session, and legacy token stores', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const helperMatch = html.match(/window\.getAuthToken = function\(\) \{([\s\S]*?)\n\s*\};/);

        expect(helperMatch).not.toBeNull();

        const helperBody = helperMatch[1];
        expect(html).toContain("window.TOKEN_KEY = 'vps_auth_token';");
        expect(helperBody).toContain('localStorage.getItem(window.TOKEN_KEY)');
        expect(helperBody).toContain('sessionStorage.getItem(window.TOKEN_KEY)');
        expect(helperBody).toContain("localStorage.getItem('token')");
        expect(helperBody).toContain("sessionStorage.getItem('token')");
        expect(helperBody).toContain("localStorage.getItem('auth_token')");
        expect(helperBody).toContain("sessionStorage.getItem('auth_token')");
    });

    test('bootstrap verifies staff credentials before app initialization', () => {
        const bootstrap = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(bootstrap).toContain("import('./credentials.js')");
        expect(bootstrap).toContain('verifyStaffCredentials');
        expect(bootstrap).toContain('renderStaffShellError');
        expect(bootstrap).toContain('bootstrapStaffShell().catch');

        const verifyIndex = bootstrap.indexOf('await verifyStaffCredentials');
        const initializeIndex = bootstrap.indexOf('initializeApp(user)');

        expect(verifyIndex).toBeGreaterThan(-1);
        expect(initializeIndex).toBeGreaterThan(-1);
        expect(verifyIndex).toBeLessThan(initializeIndex);
    });

    test('credential module checks /api/auth/me and renders visible failure state', () => {
        const credentials = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'credentials.js');

        expect(credentials).toContain('/api/auth/me');
        expect(credentials).toContain("'Cache-Control': 'no-cache'");
        expect(credentials).toContain('window.__staffCredentialCheck');
        expect(credentials).toContain('Sesi login tidak valid, silakan login ulang');
        expect(credentials).toContain('Login ulang');
        expect(credentials).toContain('Perbarui aplikasi');
        expect(credentials).toContain("import { TOKEN_KEY } from '../vps-auth-v2.js';");
        expect(credentials).toContain("const TOKEN_STORAGE_KEYS = [TOKEN_KEY, 'token', 'auth_token'];");
        expect(credentials).toContain('safeRemoveStorageItem(window.localStorage, key);');
        expect(credentials).toContain('safeRemoveStorageItem(window.sessionStorage, key);');
        expect(credentials).toMatch(/user(?:_type|Type)\s*===\s*'patient'/);
    });

    test('staff shell cache version is consistent and bootstrap script tag is valid', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const sw = readNormalizedFile('staff', 'public', 'sw.js');
        const versionMatch = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/);

        expect(versionMatch).not.toBeNull();
        const staffVersion = versionMatch[1];

        expect(sw).toContain(`const STAFF_PWA_VERSION = '${staffVersion}';`);
        expect(html).toContain(`<script type="module" src="scripts/shell/bootstrap.js?v=${staffVersion}"></script>`);
        expect(html).not.toMatch(/<script type="module">\s*<script type="module" src=/);
    });

    test('inline staff authorization headers no longer read only localStorage vps token', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');

        expect(html).not.toMatch(/Authorization['"]:\s*`Bearer \$\{localStorage\.getItem\('vps_auth_token'\)\}`/);
        expect(html).toContain('window.getAuthToken ? window.getAuthToken()');
    });
});
