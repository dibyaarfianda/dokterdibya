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

    test('near-due and overdue panels read the ongoing pregnancy from the pregnancies table', () => {
        const cases = [
            ["router.get('/api/patients/near-due-pregnancies'", /BETWEEN 259 AND 279/],
            ["router.get('/api/patients/overdue-pregnancies'", />= 280/]
        ];
        for (const [marker, bounds] of cases) {
            const body = handlerBody(marker);
            expect(body).toMatch(/FROM pregnancies/);
            expect(body).toMatch(/status = 'ongoing'/);
            expect(body).toMatch(/ORDER BY sequence DESC, id DESC/);
            expect(body).toMatch(/COALESCE\(pg\.hpl, DATE_ADD\(pg\.hpht, INTERVAL 280 DAY\)\)/);
            expect(body).toMatch(bounds);
            expect(body).not.toMatch(/LEFT JOIN birth_congratulations bc/);
            expect(body).not.toMatch(/endedSqlCondition\(/);
            expect(body).not.toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY scr\.patient_id/);
        }
    });

    test('endedSqlCondition is no longer used by patients.js', () => {
        expect(source).not.toMatch(/endedSqlCondition/);
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
