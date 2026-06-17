const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const patientMenu = fs.readFileSync(path.join(repoRoot, 'public', 'patient-menu.html'), 'utf8');

describe('Patient portal header branding', () => {
    test('header logo text is 20 percent larger for the SISIwanita portal brand', () => {
        expect(patientMenu).toMatch(/body #home-brand-title\s*\{[\s\S]*font-size:\s*19\.2px/);
        expect(patientMenu).toMatch(/body #home-brand-sub\s*\{[\s\S]*font-size:\s*8\.64px/);
    });
});
