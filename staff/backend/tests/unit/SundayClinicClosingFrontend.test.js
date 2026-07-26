const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => {
    const filePath = path.join(repoRoot, ...segments);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') : '';
};

describe('Sunday Clinic doctor-only closing frontend', () => {
    const fragment = readRepoFile('staff', 'public', 'fragments', 'pages', 'sunday-clinic-page.html');
    const entry = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic.js');
    const closing = readRepoFile(
        'staff',
        'public',
        'scripts',
        'sunday-clinic',
        'components',
        'shared',
        'closing.js'
    );
    const sharedCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css');
    const pwaCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic-pwa.css');

    test('keeps the doctor action in a stable footer outside the queue list', () => {
        const queueListIndex = fragment.indexOf('id="header-queue-list"');
        const queueListCloseIndex = fragment.indexOf('</div>', queueListIndex);
        const footerIndex = fragment.indexOf('id="sunday-clinic-closing-footer"');

        expect(queueListIndex).toBeGreaterThan(-1);
        expect(footerIndex).toBeGreaterThan(queueListCloseIndex);
        expect(fragment).toContain('id="btn-open-sunday-clinic-closing"');
        expect(fragment).toContain('id="sundayClinicClosingModal"');
        expect(fragment).toContain('Closing Hari Minggu');
    });

    test('uses the fixed doctor role contract and never role_visibility', () => {
        expect(closing).toContain("from '../../../role-constants.js'");
        expect(closing).toContain("import { getIdToken } from '../../../vps-auth-v2.js'");
        expect(closing).toContain('await getIdToken()');
        expect(closing).toContain('ROLE_IDS.DOKTER');
        expect(closing).not.toContain('ROLE_NAMES.DOKTER');
        expect(closing).toContain('Number(identity?.role_id) === ROLE_IDS.DOKTER');
        expect(closing).not.toContain('role_visibility');
        expect(closing).not.toMatch(/role\s*===\s*['\"]dokter['\"]/);
        expect(entry).toContain('role_id: user.role_id');
        expect(entry).toContain('initSundayClinicClosing(appState.staffIdentity)');
    });

    test('loads fresh preview, history and immutable detail through doctor-only APIs', () => {
        expect(closing).toContain('/api/sunday-clinic/closing/preview');
        expect(closing).toContain('/api/sunday-clinic/closing');
        expect(closing).toContain('/api/sunday-clinic/closings');
        expect(closing).toContain("cache: 'no-store'");
        expect(closing).toContain('fingerprint');
        expect(closing).toContain('can_close');
        expect(closing).toContain('Tidak tercatat');
        expect(closing).toContain('getLatestSundayWib');
        expect(closing).toContain('dateInput.value = getLatestSundayWib()');
    });

    test('initializes idempotently and cleans requests/listeners when inactive', () => {
        expect(closing).toContain('if (state.initialized)');
        expect(closing).toContain('AbortController');
        expect(closing).toContain('detailController');
        expect(closing).toContain("document.addEventListener('page:changed'");
        expect(closing).toContain("document.addEventListener('visibilitychange'");
        expect(closing).toContain("event.detail?.page !== 'sunday-clinic'");
        expect(closing).toContain("'sunday_clinic_closing_updated'");
        expect(closing).toContain('state.socket.off(eventName, handler)');
    });

    test('keeps desktop styling local and PWA styling inside the Sunday Clinic scope', () => {
        expect(sharedCss).toContain('.sc-closing-dropdown-footer');
        expect(sharedCss).toContain('#header-queue-dropdown.show');
        expect(sharedCss).toContain('#sundayClinicClosingModal');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active .sc-closing-dropdown-footer');
        expect(pwaCss).toContain('body.mobile-app-mode.sunday-clinic-embedded-active #sundayClinicClosingModal');
        expect(pwaCss).not.toMatch(/body\.mobile-app-mode(?!\.sunday-clinic-embedded-active)[^{]*sc-closing/);
    });
});
