const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');

function read(...segments) {
    return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('global registration code header', () => {
    test('renders the registration code in the persistent navbar instead of the dashboard card', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const navbar = html.slice(html.indexOf('<nav class="main-header'), html.indexOf('</nav>') + 6);

        expect(navbar).toContain('id="header-registration-code"');
        expect(navbar).toContain('id="header-registration-code-container"');
        expect(html).not.toContain('id="dashboard-current-code"');
    });

    test('keeps the registration code visible in the compact PWA header', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const mobileCss = read('staff', 'public', 'styles', 'mobile-responsive.css');

        expect(mobileCss).toContain('body.mobile-app-mode:not(.sunday-clinic-embedded-active) .main-header.navbar');
        expect(mobileCss).toContain('body.mobile-app-mode:not(.sunday-clinic-embedded-active) .navbar-registration-code-label');
        expect(mobileCss).toContain('body.mobile-app-mode:not(.sunday-clinic-embedded-active) .content-wrapper');
        expect(mobileCss).toContain('padding-top: 44px !important;');
        expect(html).toContain("contentWrapper.style.removeProperty('padding-top');");
    });

    test('places queue and doctor toggles beside the registration code in the PWA header', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const mobileCss = read('staff', 'public', 'styles', 'mobile-responsive.css');
        const navbar = html.slice(html.indexOf('<nav class="main-header'), html.indexOf('</nav>') + 6);

        expect(navbar).toContain('class="nav-item navbar-queue-control"');
        expect(navbar).toContain('class="nav-item navbar-doctor-control"');
        expect(navbar.indexOf('navbar-queue-control')).toBeGreaterThan(navbar.indexOf('navbar-registration-code'));
        expect(navbar.indexOf('navbar-doctor-control')).toBeGreaterThan(navbar.indexOf('navbar-queue-control'));
        expect(mobileCss).toContain('.navbar-queue-control');
        expect(mobileCss).toContain('.navbar-doctor-control');
        expect(mobileCss).toContain('#btn-queue-vis-toggle');
        expect(mobileCss).toContain('#btn-doctor-toggle');
        expect(mobileCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) !important;');
        expect(mobileCss).toContain('width: 100% !important; /* Equal-size header controls. */');
    });

    test('loads and refreshes the header code independently of the active page', () => {
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const registration = read('staff', 'public', 'scripts', 'shell', 'registration-codes.js');

        expect(bootstrap).toContain("'initHeaderRegistrationCode'");
        expect(bootstrap).toContain('window.initHeaderRegistrationCode?.()');
        expect(bootstrap).not.toContain("if (window.__currentPage !== 'dashboard') return;");
        expect(registration).toContain("document.getElementById('header-registration-code')");
        expect(registration).toContain('setInterval(loadHeaderRegistrationCode');
        expect(registration).toContain('window.initHeaderRegistrationCode = initHeaderRegistrationCode;');
    });
});
