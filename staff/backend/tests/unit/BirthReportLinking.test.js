'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../routes/patients.js'), 'utf8');

function routeBody(marker) {
    const start = src.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf('\nrouter.', start + marker.length);
    return src.slice(start, next === -1 ? undefined : next);
}

describe('reported births link and flag the ongoing pregnancy', () => {
    test('patient self-report flags after inserting and never closes', () => {
        const body = routeBody("router.post('/api/patient/birth-self-report'");
        const insertAt = body.indexOf('INSERT INTO birth_congratulations');
        const flagAt = body.indexOf('flagReportedBirth(');
        expect(insertAt).toBeGreaterThan(-1);
        expect(flagAt).toBeGreaterThan(insertAt);
        expect(body).toMatch(/flagReportedBirth\(\s*patientId,\s*'birth_congratulations',\s*insertResult\.insertId/);
        expect(body).not.toMatch(/endOngoing\(/);
        expect(body).toMatch(/console\.(warn|error)\(/);
    });

    test('staff upsert flags after both insert and update and never closes', () => {
        const body = routeBody("router.post('/api/patients/:patientId/birth-congratulations'");
        expect(body).not.toMatch(/endOngoing\(/);
        expect(body.indexOf('UPDATE birth_congratulations SET')).toBeLessThan(body.indexOf('flagReportedBirth('));
        expect(body.indexOf('INSERT INTO birth_congratulations')).toBeLessThan(body.lastIndexOf('flagReportedBirth('));
        expect(body).toMatch(/flagReportedBirth\(\s*patientId,\s*'birth_congratulations',\s*existing\[0\]\.id/);
        expect(body).toMatch(/flagReportedBirth\(\s*patientId,\s*'birth_congratulations',\s*insertResult\.insertId/);
    });
});
