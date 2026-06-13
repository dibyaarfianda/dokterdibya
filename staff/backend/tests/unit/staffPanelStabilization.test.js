const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('staff panel stabilization sources', () => {
    test('uses one v251 cache version source for staff assets', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(html).toContain("window.STAFF_CACHE_VERSION = 'v251';");
        expect(html).toContain('const CACHE_VERSION = window.STAFF_CACHE_VERSION;');
        expect(html).toContain('window.__assetVersion = window.STAFF_CACHE_VERSION;');
        expect(html).toContain('styles/mobile-responsive.css?v=v251');
        expect(html).not.toMatch(/CACHE_VERSION\s*=\s*'v241'/);
        expect(html).not.toMatch(/__assetVersion\s*=\s*'v250'/);
    });

    test('service worker v251 precache does not include missing chat panel css', () => {
        const sw = readRepoFile('staff', 'public', 'sw.js');

        expect(sw).toContain("const STAFF_PWA_VERSION = 'v251';");
        expect(sw).not.toContain('/staff/public/styles/chat-slide-panel.css');
    });

    test('patient photo_url schema accepts long Google avatar URLs', () => {
        const baseMigration = readRepoFile('staff', 'backend', 'migrations', 'add-patient-auth.sql');
        const longUrlMigration = readRepoFile(
            'staff',
            'backend',
            'migrations',
            '20260613_expand_patient_photo_url.sql'
        );

        expect(baseMigration).toMatch(/photo_url\s+TEXT\b/i);
        expect(baseMigration).not.toMatch(/photo_url\s+VARCHAR\(500\)/i);
        expect(longUrlMigration).toMatch(/ALTER\s+TABLE\s+patients/i);
        expect(longUrlMigration).toMatch(/MODIFY\s+COLUMN\s+photo_url\s+TEXT\s+NULL/i);
    });
});
