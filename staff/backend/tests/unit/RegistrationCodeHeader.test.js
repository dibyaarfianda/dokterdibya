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
