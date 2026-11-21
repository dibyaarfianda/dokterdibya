'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../routes/patients-auth.js'), 'utf8');
const start = source.indexOf("router.get('/pregnancy-tracker'");
const handler = source.slice(start, source.indexOf('\nrouter.', start + 10));

describe('/pregnancy-tracker handler ended branch', () => {
    test('handler is found', () => {
        expect(start).toBeGreaterThan(-1);
        expect(handler.length).toBeGreaterThan(200);
    });

    test('calls trackerEndState before the HPL grace check', () => {
        const callAt = handler.indexOf('trackerEndState(');
        expect(callAt).toBeGreaterThan(-1);
        expect(callAt).toBeLessThan(handler.indexOf('GRACE_PERIOD_DAYS'));
    });

    test('ended branch returns pregnancy_ended and ended_on with the fixed message and no outcome type', () => {
        const m = /if \(ended\) \{\s*return res\.json\(\{([\s\S]*?)\}\);/.exec(handler);
        expect(m).not.toBeNull();
        const literal = m[1];
        expect(literal).toMatch(/success:\s*true/);
        expect(literal).toMatch(/data:\s*null/);
        expect(literal).toMatch(/pregnancy_ended:\s*true/);
        expect(literal).toMatch(/ended_on/);
        expect(literal).toContain("message: 'Data kehamilan belum tersedia.'");
        expect(literal).not.toMatch(/\btype\b|outcome_type|keguguran|lahir_mati/);
    });
});
