const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('patient intake profile completion contract', () => {
    test('authenticated intake submission syncs patient profile completion fields', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'patient-intake.js');

        expect(route).toContain('async function syncAuthenticatedPatientProfileFromIntake(patientId, payload)');
        expect(route).toContain('full_name = COALESCE(?, full_name)');
        expect(route).toContain('phone = COALESCE(?, phone)');
        expect(route).toContain('whatsapp = COALESCE(?, whatsapp)');
        expect(route).toContain('birth_date = COALESCE(?, birth_date)');
        expect(route).toContain('profile_completed = CASE');
        expect(route).toContain('intake_completed = 1');
        expect(route).toContain('await syncAuthenticatedPatientProfileFromIntake(decoded.id, payload);');
        expect(route).toContain('await syncAuthenticatedPatientProfileFromIntake(patientId, payload);');
        expect(route).not.toContain('UPDATE patients SET intake_completed = 1 WHERE id = ?');
    });
});
