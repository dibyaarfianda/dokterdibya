const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../routes/patients.js'), 'utf8');

function handlerBody(marker) {
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const next = source.indexOf('\nrouter.', start + marker.length);
    return source.slice(start, next === -1 ? undefined : next);
}

describe('patients.js uses the pregnancy end rule', () => {
    test('birthSet is gone', () => {
        expect(source).not.toMatch(/birthSet/);
    });

    test('near-due and overdue panels no longer join birth_congratulations', () => {
        for (const marker of ["router.get('/api/patients/near-due-pregnancies'", "router.get('/api/patients/overdue-pregnancies'"]) {
            const body = handlerBody(marker);
            expect(body).not.toMatch(/LEFT JOIN birth_congratulations bc/);
            expect(body).toMatch(/NOT \$\{endedSqlCondition\(/);
        }
    });

    test('endedSqlCondition is used at least twice', () => {
        expect((source.match(/endedSqlCondition\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    test('both list endpoints read the current pregnancy from the pregnancies table', () => {
        for (const marker of ["router.get('/api/patients',", "router.get('/api/patients/search/advanced'"]) {
            const body = handlerBody(marker);
            expect(body).toMatch(/loadCurrentPregnancies\(/);
            expect(body).toMatch(/listFields\(/);
            expect(body).not.toMatch(/loadEndEvents\(/);
            expect(body).not.toMatch(/pregnancyListFields\(/);
        }
    });
});
