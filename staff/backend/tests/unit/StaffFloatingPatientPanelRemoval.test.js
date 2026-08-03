const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

describe('legacy floating Kelola Pasien panel removal', () => {
    test('keeps the main patient table without the duplicate floating panel', () => {
        const shell = read('staff', 'public', 'index-adminlte.html');
        const patientTools = read('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const staffCss = read('staff', 'public', 'styles', 'staff-shell.css');
        const mobileCss = read('staff', 'public', 'styles', 'mobile-responsive.css');

        expect(shell).toContain('id="manage-patients-table"');
        for (const source of [shell, patientTools, staffCss, mobileCss]) {
            expect(source).not.toContain('floating-kelola-pasien');
            expect(source).not.toContain('loadFloatingPanelPatients');
            expect(source).not.toContain('toggleFloatingPanel');
            expect(source).not.toContain('hideFloatingPanel');
        }
    });
});
