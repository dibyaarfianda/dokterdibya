const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('staff and patient shell wave 1 contracts', () => {
    test('staff shell entry scripts use the current staff cache version', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const sw = readNormalizedFile('staff', 'public', 'sw.js');
        const versionMatch = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/);

        expect(versionMatch).not.toBeNull();
        const staffVersion = versionMatch[1];

        expect(sw).toContain(`const STAFF_PWA_VERSION = '${staffVersion}';`);
        expect(html).toContain(`scripts/shell/actions.js?v=${staffVersion}`);
        expect(html).toContain(`scripts/shell/bootstrap.js?v=${staffVersion}`);
    });

    test('patient portal shell version governs home, manifest, service workers, and tool assets', () => {
        const rootSw = readNormalizedFile('public', 'sw.js');
        const sisiwanitaSw = readNormalizedFile('public', 'sisiwanita-sw.js');
        const patientMenu = readNormalizedFile('public', 'patient-menu.html');
        const manifest = readNormalizedFile('public', 'patient-portal.webmanifest');
        const versionMatch = rootSw.match(/const CACHE_VERSION = '([^']+)';/);

        expect(versionMatch).not.toBeNull();
        const shellVersion = versionMatch[1];

        expect(sisiwanitaSw).toContain(`const CACHE_VERSION = '${shellVersion}';`);
        expect(patientMenu).toContain(`/patient-portal.webmanifest?v=${shellVersion}`);
        expect(patientMenu).toContain(`/sw.js?v=${shellVersion}`);
        expect(patientMenu).toContain(`/scripts/patient-menu-shell.js?v=${shellVersion}`);
        expect(manifest).toContain(`/patient-menu.html?source=pwa&v=${shellVersion}`);
    });

    test('patient retrofit shell uses data-shell-action for injected topbar and bottom navigation', () => {
        const retrofit = readNormalizedFile('public', 'scripts', 'patient-tool-retrofit.js');

        expect(retrofit).toContain('data-shell-action="open-settings"');
        expect(retrofit).toContain('data-shell-action="open-profile"');
        expect(retrofit).toContain('data-shell-action="scroll-top-home"');
        expect(retrofit).toContain("overlay.setAttribute('data-shell-action', 'close-sheet');");
        expect(retrofit).toContain('data-shell-action="go" data-shell-href="/patient-menu.html"');
        expect(retrofit).toContain('data-shell-action="open-sheet" data-shell-sheet="dokumen"');
        expect(retrofit).not.toContain('onclick="openSettingsModal(event)"');
        expect(retrofit).not.toContain('onclick="openProfileModal(event)"');
        expect(retrofit).not.toContain('onclick="scrollTopHome()"');
        expect(retrofit).not.toContain("onclick=\"go('/patient-menu.html')\"");
        expect(retrofit).not.toContain("onclick=\"openSheet('dokumen')\"");
    });
});
