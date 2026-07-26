const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs
    .readFileSync(path.join(repoRoot, ...segments), 'utf8')
    .replace(/\r\n/g, '\n');

describe('Sunday Clinic desktop layout', () => {
    const page = readRepoFile('staff', 'public', 'fragments', 'pages', 'sunday-clinic-page.html');
    const sharedCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css');
    const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');
    const app = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');
    const shell = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic.js');
    const obstetricUsg = readRepoFile(
        'staff',
        'public',
        'scripts',
        'sunday-clinic',
        'components',
        'obstetri',
        'usg-obstetri.js'
    );

    test('uses a responsive toolbar and wrapped desktop section navigation', () => {
        expect(page).toContain('class="card card-outline card-primary mb-3 sc-page-toolbar-card"');
        expect(page).toContain('class="card-header d-flex justify-content-between align-items-center flex-wrap sc-page-toolbar"');
        expect(page).toContain('class="sc-page-identity"');
        expect(page).toContain('class="d-flex align-items-center flex-wrap sc-page-actions"');
        expect(page).toContain('class="card-body sc-page-section-bar"');
        expect(sharedCss).toContain('body.sunday-clinic-embedded-active:not(.mobile-app-mode) .sc-page-actions');
        expect(sharedCss).toContain('flex: 1 1 150px !important;');
        expect(sharedCss).toContain('max-width: 220px !important;');
    });

    test('removes duplicate desktop section labels and hides an empty context header', () => {
        expect(sharedCss).toContain('body.sunday-clinic-embedded-active:not(.mobile-app-mode) .sc-section-inline-title');
        expect(sharedCss).toContain('display: none !important;');
        expect(app).toContain('syncExaminationActionBar()');
        expect(app).toContain("header.style.setProperty(");
        expect(app).toContain("hasContext || hasExamAction ? 'flex' : 'none'");
        expect(app).toContain("'important'");
        expect(app).not.toContain("bar.style.display = isPrivat ? 'flex' : 'none';");
    });

    test('routes all Sunday Clinic notices through a non-blocking bottom stack', () => {
        expect(app).toContain('window.showSundayClinicNotice = function(type, message, duration = 3000)');
        expect(app).toContain("container.className = 'sc-toast-stack';");
        expect(app).not.toContain("container.style.cssText = 'position: fixed; top: 70px; right: 20px;");
        expect(shell).toContain("window.showSundayClinicNotice('success', message, 3000)");
        expect(shell).toContain("window.showSundayClinicNotice('error', message, 5000)");
        expect(obstetricUsg).toContain('window.showSundayClinicNotice(type, message, 3000)');
        expect(sharedCss).toContain('body.sunday-clinic-embedded-active .sc-toast-stack');
        expect(sharedCss).toContain('bottom: 20px !important;');
        expect(sharedCss).toContain('pointer-events: none !important;');
        expect(pwaCss).toContain('bottom: calc(var(--sc-pwa-bottom-nav-height, 60px) + 12px) !important;');
    });
});
