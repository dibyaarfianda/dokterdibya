'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../routes/patients-auth.js'), 'utf8');
const start = source.indexOf("router.get('/pregnancy-tracker'");
const handler = source.slice(start, source.indexOf('\nrouter.', start + 10));

describe('/pregnancy-tracker handler reads the ongoing pregnancy only', () => {
    test('handler is found', () => {
        expect(start).toBeGreaterThan(-1);
        expect(handler.length).toBeGreaterThan(200);
    });

    test('no longer uses the date rule (trackerEndState)', () => {
        expect(handler).not.toContain('trackerEndState');
        expect(source).not.toMatch(/require\('\.\.\/services\/PregnancyEnd'\)/);
    });

    test('still auto-hides after HPL + 14 days', () => {
        expect(handler).toContain('GRACE_PERIOD_DAYS = 14');
        expect(handler).toMatch(/daysUntilEdd < -GRACE_PERIOD_DAYS/);
    });

    test('no ongoing pregnancy returns the neutral message without any ended flag or outcome', () => {
        const callAt = handler.indexOf('findOngoingPregnancy(');
        const firstReturn = handler.indexOf('return res.json', callAt);
        const literal = handler.slice(firstReturn, handler.indexOf('});', firstReturn));
        expect(literal).toMatch(/success:\s*true/);
        expect(literal).toMatch(/data:\s*null/);
        expect(literal).toContain("message: 'Data kehamilan belum tersedia.'");
        expect(handler).not.toMatch(/pregnancy_ended|ended_on|lahir_mati|outcome/);
    });
});
