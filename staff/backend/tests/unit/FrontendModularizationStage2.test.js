const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('frontend modularization stage 2', () => {
    test('patient menu composes session, routing, navigation, layout, and lazy feature modules', () => {
        const html = read('public', 'patient-menu.html');
        const shell = read('public', 'scripts', 'patient-menu-shell.js');
        const featureLoader = read('public', 'scripts', 'patient-shell', 'feature-loader.js');

        expect(shell).toContain("from './patient-shell/session-bootstrap.js'");
        expect(shell).toContain("from './patient-shell/router.js'");
        expect(shell).toContain("from './patient-shell/navigation.js'");
        expect(shell).toContain("from './patient-shell/layout.js'");
        expect(shell).toContain("from './patient-shell/feature-loader.js'");
        expect(shell).not.toContain("function getToken()");
        expect(shell).toContain('bindPatientNavigation(shellActionHandlers)');
        expect(featureLoader).toContain("import('../profile-photo-cropper.js')");
        expect(html).not.toContain('<script src="/scripts/profile-photo-cropper.js');
        expect(html).not.toMatch(/\son(?:click|change|input|submit|keydown)=/i);
    });

    test('patient session bootstrap owns canonical user and token access', () => {
        const session = read('public', 'scripts', 'patient-shell', 'session-bootstrap.js');
        const shell = read('public', 'scripts', 'patient-menu-shell.js');

        expect(session).toContain('return requirePatientSession().getToken()');
        expect(session).toContain('return requirePatientSession().getUser()');
        expect(session).toContain('return requirePatientSession().setUser(');
        expect(shell).toContain('getPatientUser()');
        expect(shell).not.toContain("JSON.parse(localStorage.getItem('patient_user')");
    });

    test('patient photo cropper is no longer part of initial page loading', () => {
        const html = read('public', 'patient-menu.html');

        expect(html).not.toContain('<script src="/scripts/profile-photo-cropper.js');
    });

    test('landing page starts through a dedicated module bootstrap', () => {
        const html = read('public', 'sisiwanita', 'index.html');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const featureLoader = read('public', 'scripts', 'landing', 'feature-loader.js');

        expect(html).toMatch(/<script type="module" src="\/scripts\/landing\/bootstrap\.js\?v=[^"' ]+"><\/script>/);
        expect(bootstrap).toContain("import('./feature-loader.js')");
        expect(featureLoader).toContain('export async function loadLandingFeature');
    });

    test('landing page preserves native responsive scrolling', () => {
        const html = read('public', 'sisiwanita', 'index.html');

        expect(html).not.toMatch(/addEventListener\('wheel',\s*function\(e\)\s*\{\s*e\.preventDefault\(\)/);
        expect(html).not.toContain('targetY += e.deltaY * wheelForce');
        expect(html).toContain('Preserve native wheel, trackpad, touch, keyboard, and assistive scrolling.');
    });

    test('landing feature stack is sticky only on eligible desktops', () => {
        const html = read('public', 'sisiwanita', 'index.html');

        expect(html).toContain('(min-width: 769px) and (hover: hover) and (pointer: fine)');
        expect(html).toContain('var STACK_SAFE_GAP = 48;');
        expect(html).toContain('STICKY_OFFSET + (rows.length * COLLAPSED_H) + STACK_SAFE_GAP');
        expect(html).toContain("window.__portalStickyStackMode = isStickyStackEnabled ? 'full' : 'static';");
        expect(html).toMatch(/html\.feature-stack-static \.proces-row\s*\{[\s\S]*?position:\s*relative !important;[\s\S]*?top:\s*auto !important;[\s\S]*?z-index:\s*auto !important;/);
        expect(html).toMatch(/html\.feature-stack-static \.proces-desc\s*\{[\s\S]*?opacity:\s*1 !important;[\s\S]*?max-height:\s*none !important;/);
        expect(html).toMatch(/\.patient-features-section \.proces-row\[hidden\]\s*\{\s*display:\s*none !important;/);
        expect(html).toContain("row.style.removeProperty('top');");
        expect(html).toContain("row.style.removeProperty('z-index');");
        expect(html).toContain("row.style.removeProperty('padding-top');");
        expect(html).toContain("row.style.removeProperty('padding-bottom');");
        expect(html).toContain("desc.style.removeProperty('opacity');");
        expect(html).toContain("desc.style.removeProperty('max-height');");
        expect(html).toContain("sd.el.style.removeProperty('min-height');");
        expect(html).toContain("attributeFilter: ['hidden']");
    });

    test('landing feature stack keeps downward scrolling monotonic and releases promptly', () => {
        const html = read('public', 'sisiwanita', 'index.html');
        const stickyStart = html.indexOf('// ==================== STICKY STACK');
        const stickyEnd = html.indexOf('// ==================== HERO FIXED BG', stickyStart);

        expect(stickyStart).toBeGreaterThan(-1);
        expect(stickyEnd).toBeGreaterThan(stickyStart);
        const sticky = html.slice(stickyStart, stickyEnd);
        expect(html).toMatch(/\.patient-features-section,[\s\S]*?\.patient-features-section \.proces-row,[\s\S]*?\.patient-features-section \.proces-desc\s*\{[\s\S]*?overflow-anchor:\s*none !important;/);
        expect(html).toMatch(/\.proces-spacer\s*\{\s*height:\s*72px;/);
        expect(sticky).toContain('var start = row.offsetTop - slotTop;');
        expect(sticky).not.toContain('rowLead = i * 56');
        expect(sticky).not.toContain('finalRowCompleteP');
        expect(sticky).not.toContain('setInterval(onScroll, 33)');
        expect(sticky).not.toContain("addEventListener('wheel', scheduleScrollSync");
        expect(sticky).not.toContain("addEventListener('touchmove', scheduleScrollSync");
        expect(sticky).toContain("window.addEventListener('scroll', scheduleScrollSync, { passive: true });");
    });

    test('staff shell supports delegated compatibility actions while globals migrate', () => {
        const html = read('staff', 'public', 'index-adminlte.html');
        const actions = read('staff', 'public', 'scripts', 'shell', 'actions.js');

        expect(html).toContain('data-staff-call="showHospitalAppointmentsPage"');
        expect(html).not.toContain("onclick=\"showHospitalAppointmentsPage('rsia_melinda');");
        expect(actions).toContain("event.target.closest('[data-staff-call]')");
        expect(actions).toContain('JSON.parse(target.dataset.staffArgs ||');
    });
});
