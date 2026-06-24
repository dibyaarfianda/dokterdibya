const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('staff shell refactor phase 1', () => {
    test('bootstrap startup moves from inline module script to dedicated shell bootstrap module', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const bootstrap = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(html).toMatch(/<script type="module" src="(?:\/staff\/public\/)?scripts\/shell\/bootstrap\.js\?v=[^"' ]+"><\/script>/);
        expect(html).not.toContain("const { auth, getIdToken, initAuth: initAuthLib } = await import('./scripts/vps-auth-v2.js?v=' + v);");
        expect(bootstrap).toContain("const { auth, getIdToken, initAuth: initAuthLib } = await import('../vps-auth-v2.js?v=' + v);");
        expect(bootstrap).toContain('initializeApp(user);');
    });

    test('core shell controls use delegated data-shell-action hooks instead of inline onclick', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const actions = readNormalizedFile('staff', 'public', 'scripts', 'shell', 'actions.js');

        expect(html).toMatch(/id="navbar-profile-btn"[^>]*data-shell-action="open-profile-settings"/);
        expect(html).toMatch(/id="navbar-logout-btn"[^>]*data-shell-action="logout"/);
        expect(html).toMatch(/id="nav-dashboard"[\s\S]*?data-shell-action="show-dashboard"/);
        expect(html).toMatch(/id="nav-kantor-saya"[\s\S]*?data-shell-action="show-kantor-saya"/);
        expect(html).toMatch(/id="nav-klinik-private"[\s\S]*?data-shell-action="show-klinik-private"/);
        expect(html).toMatch(/id="nav-kelola-pasien"[\s\S]*?data-shell-action="show-manage-patients"/);
        expect(html).toMatch(/id="nav-tanya-dokter"[\s\S]*?data-shell-action="show-tanya-dokter"/);
        expect(html).toMatch(/id="mobile-btn-dashboard"[^>]*data-shell-action="mobile-nav"[^>]*data-mobile-nav="dashboard"/);
        expect(html).toMatch(/id="mobile-btn-more"[^>]*data-shell-action="open-mobile-menu"/);
        expect(html).not.toContain('id="navbar-profile-btn" onclick=');
        expect(html).not.toContain('id="mobile-btn-dashboard" class="active" onclick=');

        expect(actions).toContain('const shellActionHandlers = {');
        expect(actions).toContain("'show-dashboard'");
        expect(actions).toContain("'open-mobile-menu'");
        expect(actions).toContain("document.addEventListener('click'");
        expect(actions).toContain('window.openMobileMenu = openMobileMenu;');
    });
});
