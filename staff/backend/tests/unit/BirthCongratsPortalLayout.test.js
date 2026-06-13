const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const patientMenu = fs.readFileSync(path.join(repoRoot, 'public', 'patient-menu.html'), 'utf8');
const patientRoutes = fs.readFileSync(path.join(repoRoot, 'staff', 'backend', 'routes', 'patients.js'), 'utf8');

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

    test('new patient portal carries over legacy birth congratulations interactions', () => {
        expect(patientMenu).toContain('birth-corner-accent');
        expect(patientMenu).toContain('openBirthPhotoModal');
        expect(patientMenu).toContain('birth-photo-modal');
        expect(patientMenu).toContain('applyBirthCongratsTheme');
        expect(patientMenu).toContain('theme_color');
        expect(patientMenu).toContain('/api/patient/birth-pending');
        expect(patientMenu).toContain('/api/patient/birth-data/');
        expect(patientMenu).toContain('/api/patient/birth-extra/');
        expect(patientMenu).toContain('/api/patient/birth-photo/');
        expect(patientMenu).toContain('/api/patient/birth-testimonial/');
        expect(patientMenu).toContain('Lengkapi data kelahiran');
        expect(patientMenu).toContain('Upload foto bayi');
        expect(patientMenu).toContain('Kirim testimoni');
        expect(patientMenu).toContain('patient_data_submitted');
        expect(patientMenu).toContain('patient_testimonial');
        expect(patientMenu).toContain('hidePregnancyTrackerHome');
    });

    test('patient birth endpoints return fields needed by the new portal', () => {
        expect(patientRoutes).toContain('patient_testimonial');
        expect(patientRoutes).toContain('patient_data_submitted');
        expect(patientRoutes).toContain('theme_color');
        expect(patientRoutes).toContain('photo_url');
        expect(patientRoutes).toContain('/api/patient/birth-photo/:id');
        expect(patientRoutes).toContain('/api/patient/birth-testimonial/:id');
    });
});
