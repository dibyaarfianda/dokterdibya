'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const mainSource = fs
    .readFileSync(path.join(repoRoot, 'staff', 'public', 'scripts', 'main.js'), 'utf8')
    .replace(/\r\n/g, '\n');

function extractTopLevelFunction(source, name) {
    const start = source.indexOf(`async function ${name}(`);
    if (start === -1) {
        return '';
    }

    const remainder = source.slice(start);
    const nextFn = remainder.search(/\nasync function |\nfunction /);
    return nextFn === -1 ? remainder : remainder.slice(0, nextFn);
}

describe('walk-in DRD restore', () => {
    test('startPatientVisit creates walk-in DRD instead of sending staff to PERIKSA', () => {
        const startVisit = extractTopLevelFunction(mainSource, 'startPatientVisit');
        const helper = extractTopLevelFunction(mainSource, 'resolveOrCreateWalkInRecord');
        const hospitalStart = extractTopLevelFunction(mainSource, '_startHospitalRecord');

        expect(helper).toContain("fetch('/api/sunday-clinic/start-walk-in'");
        expect(helper).toContain('patient_id: patientId');
        expect(helper).toContain('category: category');
        expect(helper).toContain('location: visitLocation');

        expect(startVisit).toContain('resolveOrCreateWalkInRecord(patientId, location, category)');
        expect(startVisit).toContain('buildSundayClinicAppUrl(record.mrId, \'identitas\')');
        expect(startVisit).not.toContain('Gunakan tombol PERIKSA');
        expect(startVisit).not.toContain('Only PERIKSA button can create');

        expect(hospitalStart).toContain('resolveOrCreateWalkInRecord(patientId, location, category)');
    });
});
