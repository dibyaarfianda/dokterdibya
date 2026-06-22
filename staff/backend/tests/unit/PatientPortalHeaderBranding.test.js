const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const patientMenu = fs.readFileSync(path.join(repoRoot, 'public', 'patient-menu.html'), 'utf8');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Patient portal header branding', () => {
    test('header logo text is another 20 percent larger for the SISIwanita portal brand', () => {
        expect(patientMenu).toMatch(/body #home-brand-title\s*\{[\s\S]*font-size:\s*23\.04px/);
        expect(patientMenu).toMatch(/body #home-brand-sub\s*\{[\s\S]*font-size:\s*10\.368px/);
        expect(patientMenu).toMatch(/\.hero-card\s*\{[^}]*margin-top:\s*4px;/);
    });

    test('patient tool shell matches home header brand sizing and vertical rhythm', () => {
        const shellCss = readRepoFile('public', 'styles', 'patient-tool-shell.css');
        const retrofitCss = readRepoFile('public', 'styles', 'patient-tool-retrofit.css');
        const sw = readRepoFile('public', 'sw.js');
        const sisiwanitaSw = readRepoFile('public', 'sisiwanita-sw.js');
        const shellVersion = '20260621headerhome2';
        const shellPages = [
            'album-usg.html',
            'antrian.html',
            'artikel.html',
            'booking-klinik.html',
            'contraction-timer.html',
            'dokumen-medis.html',
            'fertility-calendar.html',
            'hasil-lab.html',
            'jadwal-rs.html',
            'jadwal-vitamin.html',
            'kelas-persalinan.html',
            'kick-counter.html',
            'patient-tool-template.html',
            'perjalanan-ibu.html',
            'pregnancy-tracker.html',
            'riwayat-kunjungan.html',
            'ruang-cerita.html',
            'tanya-dokter.html'
        ];
        const retrofitPages = [
            'album-usg.html',
            'antrian.html',
            'artikel.html',
            'booking-klinik.html',
            'dokumen-medis.html',
            'hasil-lab.html',
            'jadwal-rs.html',
            'riwayat-kunjungan.html',
            'ruang-cerita.html',
            'tanya-dokter.html'
        ];

        expect(shellCss).toMatch(/body\.patient-tool-shell #home-brand-title,[\s\S]*font-size:\s*23\.04px\s*!important;/);
        expect(shellCss).toMatch(/body\.patient-tool-shell #home-brand-sub,[\s\S]*font-size:\s*10\.368px\s*!important;/);
        expect(shellCss).toMatch(/body\.patient-tool-shell #home-topbar\s*\{[\s\S]*margin-bottom:\s*clamp\(22px,\s*4vh,\s*42px\)\s*!important;/);
        expect(shellCss).toMatch(/body\.patient-tool-shell \.hero-card\s*\{[\s\S]*margin-top:\s*4px\s*!important;/);
        expect(shellCss).not.toMatch(/body\.patient-tool-shell \.hero-card\s*\{[\s\S]*margin-top:\s*60px\s*!important;/);
        expect(shellCss).toMatch(/@media \(max-width:\s*520px\)[\s\S]*body\.patient-tool-shell #home-brand-title,[\s\S]*font-size:\s*19px\s*!important;/);
        expect(shellCss).toMatch(/@media \(max-width:\s*520px\)[\s\S]*body\.patient-tool-shell #home-brand-sub,[\s\S]*font-size:\s*8\.4px\s*!important;/);
        expect(retrofitCss).toMatch(/body\.legacy-tool-retrofit #home-topbar\.topbar\s*\{[\s\S]*margin-bottom:\s*clamp\(22px,\s*4vh,\s*42px\)\s*!important;/);
        expect(retrofitCss).not.toMatch(/body\.legacy-tool-retrofit #home-topbar\.topbar\s*\{[^}]*margin:\s*0\s*!important;/);
        expect(retrofitCss).toMatch(/body\.legacy-tool-retrofit[\s\S]*:not\(#pmc-root \*\)[\s\S]*padding-top:\s*0\s*!important;/);
        expect(sw).toContain(`const CACHE_VERSION = '${shellVersion}';`);
        expect(sisiwanitaSw).toContain(`const CACHE_VERSION = '${shellVersion}';`);

        shellPages.forEach(fileName => {
            const page = readRepoFile('public', fileName);
            expect(page).toContain(`/styles/patient-tool-shell.css?v=${shellVersion}`);
            expect(page).toContain(`/scripts/patient-tool-shell.js?v=${shellVersion}`);

            const afterShellLink = page.slice(page.indexOf('/styles/patient-tool-shell.css'));
            expect(afterShellLink).not.toMatch(/#home-brand-title\s*\{[^}]*font-size:\s*16px\s*!important;/);
            expect(afterShellLink).not.toMatch(/#home-brand-sub\s*\{[^}]*font-size:\s*7\.2px\s*!important;/);
            expect(afterShellLink).not.toMatch(/\.hero-card\s*\{[^}]*margin-top:\s*60px\s*!important;/);
        });

        retrofitPages.forEach(fileName => {
            const page = readRepoFile('public', fileName);
            expect(page).toContain(`/styles/patient-tool-retrofit.css?v=${shellVersion}`);
            expect(page).toContain(`/scripts/patient-tool-retrofit.js?v=${shellVersion}`);
        });
    });
});
