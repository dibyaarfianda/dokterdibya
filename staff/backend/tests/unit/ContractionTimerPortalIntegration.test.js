const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Contraction timer portal integration', () => {
    test('patient tool page contains the expected API contract and safety copy', () => {
        const page = readRepoFile('public', 'contraction-timer.html');

        expect(page).toContain('/api/contraction-timer/today');
        expect(page).toContain('/api/contraction-timer/session');
        expect(page).toContain('/api/contraction-timer/event');
        expect(page).toContain('Mulai kontraksi');
        expect(page).toContain('Selesai kontraksi');
        expect(page).toContain('segera ke unit persalinan/IGD');
        expect(page).toContain('Braxton Hicks');
        expect(page).not.toMatch(/fase aktif pasti/i);
    });

    test('portal entry points include contraction timer', () => {
        const patientMenu = readRepoFile('public', 'patient-menu.html');
        const pageTracker = readRepoFile('public', 'js', 'patient-tracker.js');
        const shell = readRepoFile('public', 'scripts', 'patient-tool-shell.js');
        const bottomNav = readRepoFile('public', 'scripts', 'portal-bottom-nav.js');
        const retrofit = readRepoFile('public', 'scripts', 'patient-tool-retrofit.js');
        const sw = readRepoFile('public', 'sw.js');

        for (const source of [patientMenu, pageTracker, shell, bottomNav, retrofit, sw]) {
            expect(source).toContain('contraction-timer.html');
        }
    });

    test('monitoring kehamilan does not show contraction timer CTA', () => {
        const tracker = readRepoFile('public', 'pregnancy-tracker.html');

        expect(tracker).not.toContain('contraction-timer.html');
    });

    test('help surfaces mention contraction timer', () => {
        const faq = readRepoFile('public', 'bantuan.html');
        const supportChat = readRepoFile('staff', 'backend', 'routes', 'support-chat.js');

        expect(faq).toMatch(/kontraksi/i);
        expect(supportChat).toMatch(/kontraksi/i);
        expect(supportChat).toContain('unit persalinan/IGD');
    });
});
