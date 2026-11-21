'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../routes/patients-auth.js'), 'utf8');
const start = source.indexOf("router.get('/pregnancy-tracker'");
const handler = source.slice(start, source.indexOf('\nrouter.', start + 10));

function literalAfter(marker) {
    const at = handler.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    const ret = handler.indexOf('res.json({', at);
    return handler.slice(ret + 'res.json({'.length, handler.indexOf('});', ret));
}

function keysOf(literal) {
    return literal.split('\n').map(l => /^\s*(\w+):/.exec(l)).filter(Boolean).map(m => m[1]);
}

describe('/pregnancy-tracker handler', () => {
    test('handler is found', () => {
        expect(start).toBeGreaterThan(-1);
        expect(handler.length).toBeGreaterThan(200);
    });

    test('does not use the date rule (trackerEndState)', () => {
        expect(handler).not.toContain('trackerEndState');
        expect(source).not.toContain('trackerEndState');
    });

    test('still auto-hides after HPL + 14 days', () => {
        expect(handler).toContain('GRACE_PERIOD_DAYS = 14');
        expect(handler).toMatch(/daysUntilEdd < -GRACE_PERIOD_DAYS/);
    });

    test('with no ongoing pregnancy it looks up lastEnded via loadCurrentPregnancies', () => {
        expect(handler).toMatch(/loadCurrentPregnancies\(db, \[patientId\]\)/);
        expect(handler).toContain('lastEnded');
        expect(handler.indexOf('findOngoingPregnancy(')).toBeLessThan(handler.indexOf('loadCurrentPregnancies('));
    });

    test('ended branch has exactly success/data/pregnancy_ended/ended_on/message and never names a loss', () => {
        const literal = literalAfter('current.lastEnded');
        expect(keysOf(literal)).toEqual(['success', 'data', 'pregnancy_ended', 'ended_on', 'message']);
        expect(literal).toMatch(/data:\s*null/);
        expect(literal).toMatch(/pregnancy_ended:\s*true/);
        expect(literal).toMatch(/ended_on:\s*toDateString\(current\.lastEnded\.ended_on\) \|\| null/);
        expect(literal).toContain("message: 'Data kehamilan belum tersedia.'");
        expect(literal).not.toMatch(/\btype\b|outcome|keguguran|lahir_mati/);
    });

    test('no-history branch has no pregnancy_ended and the same neutral message', () => {
        const endedAt = handler.indexOf('current.lastEnded');
        const secondReturn = handler.indexOf('return res.json({', handler.indexOf('});', endedAt));
        const literal = handler.slice(secondReturn, handler.indexOf('});', secondReturn));
        expect(keysOf(literal.replace('return res.json({', ''))).toEqual(['success', 'data', 'message']);
        expect(literal).not.toMatch(/pregnancy_ended|ended_on/);
        expect(literal).toContain("message: 'Data kehamilan belum tersedia.'");
    });

    test('no other response in the handler names a loss', () => {
        expect(handler).not.toMatch(/lahir_mati|outcome|\.type\b/);
    });
});
