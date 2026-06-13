const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const patientMenu = fs.readFileSync(path.join(repoRoot, 'public', 'patient-menu.html'), 'utf8');

describe('Birth congratulations portal layout', () => {
    test('home congratulations card is square, not a full-width rectangle', () => {
        expect(patientMenu).toContain('.birth-congrats-home');
        expect(patientMenu).toMatch(/\.birth-congrats-home\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1/);
        expect(patientMenu).toMatch(/\.birth-congrats-home\s*\{[\s\S]*max-width:\s*390px/);
        expect(patientMenu).toContain('height: min(calc(100vw - 28px), 390px)');
        expect(patientMenu).toContain('grid-template-columns: var(--birth-photo-size) minmax(0, 1fr)');
        expect(patientMenu).not.toContain('.birth-congrats-body { grid-template-columns: 1fr; }');
        expect(patientMenu).not.toContain('.birth-congrats-photo-wrap { width: 100%; height: 150px; }');
    });
});
