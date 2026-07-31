const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('patient menu shell refactor phase 1', () => {
    test('home shell logic is extracted from inline html into a dedicated script file', () => {
        const page = readNormalizedFile('public', 'patient-menu.html');
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');

        expect(page).toMatch(/<script type="module" src="\/scripts\/patient-menu-shell\.js\?v=[^"' ]+"><\/script>/);
        expect(page).not.toContain("const CORNER_NAME_KEY = 'patient_my_corner_name';");
        expect(page).not.toContain('window.openSettingsModal = openSettingsModal;');
        expect(shell).toContain("const CORNER_NAME_KEY = 'patient_my_corner_name';");
        expect(shell).toContain('window.openSettingsModal = openSettingsModal;');
        expect(shell).toContain('window.openProfileModal = openProfileModal;');
    });

    test('static patient shell controls use delegated data-shell-action hooks', () => {
        const page = readNormalizedFile('public', 'patient-menu.html');
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');

        expect(page).toMatch(/id="home-notif-btn"[^>]*data-shell-action="open-settings"/);
        expect(page).toMatch(/id="user-avatar"[^>]*data-shell-action="open-profile"/);
        expect(page).toMatch(/class="live-queue-link soundable"[^>]*data-shell-action="go"[^>]*data-shell-href="\/antrian\.html"/);
        expect(page).toMatch(/class="tap-card soundable"[^>]*data-shell-action="open-sheet"[^>]*data-shell-sheet="dokumen"/);
        expect(page).toMatch(/class="tap-card soundable"[^>]*data-shell-action="go"[^>]*data-shell-href="\/tanya-dokter\.html"/);
        expect(page).toMatch(/id="my-corner-action-btn"[^>]*data-shell-action="open-my-corner"/);
        expect(page).toMatch(/id="announcement-action"[^>]*data-shell-action="go"[^>]*data-shell-href="\/info-terbaru\.html\?_v=20260602md2"/);
        expect(page).toMatch(/class="nav-item active soundable"[^>]*data-shell-action="scroll-top-home"/);
        expect(page).not.toContain('id="home-notif-btn" onclick=');
        expect(page).not.toContain('id="my-corner-action-btn" onclick=');

        expect(shell).toContain('const shellActionHandlers = Object.assign({}, modalActionHandlers, {');
        expect(shell).toContain("'open-settings'");
        expect(shell).toContain("'open-profile'");
        expect(shell).toContain("'open-sheet'");
        expect(shell).toContain("'scroll-top-home'");
        expect(shell).toContain('bindPatientNavigation(shellActionHandlers);');
    });
});
